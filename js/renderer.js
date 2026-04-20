(function(App) {
  App.vp = { x: 0, y: 0, scale: 1 };
  App.cachedPositions = {};
  App.cachedGenMap = {};
  App.selectedPersonId = null;
  App.searchHighlightIds = new Set();
  App.searchCurrentId = null;

  var isPanning = false, panStart = {x:0,y:0}, vpStart = {x:0,y:0};

  // Drag state for sibling reordering
  var dragState = null;

  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.entries(attrs).forEach(function(e){el.setAttribute(e[0],e[1]);});
    return el;
  }

  function nodeColors(person) {
    // 柔和中性配色
    if (person.gender === 'male')   return { fill:'#e3f2fd', stroke:'#5c9bd4', text:'#336699' };
    if (person.gender === 'female') return { fill:'#fce4ec', stroke:'#d48a9e', text:'#994466' };
    return { fill:'#f5f5f5', stroke:'#999999', text:'#666666' };
  }

  function formatDateRange(birth, death) {
    if (!birth && !death) return '';
    var b = birth ? birth.slice(0,4) : '?';
    if (death) return b + '–' + death.slice(0,4);
    if (birth) return b + '–';
    return '';
  }

  function getPathMidpoint(d) {
    var nums = d.match(/-?\d+(\.\d+)?/g);
    if (!nums || nums.length < 4) return {x:0,y:0};
    var n = nums.map(Number);
    return {x:(n[0]+n[n.length-2])/2, y:(n[1]+n[n.length-1])/2};
  }

  function renderBands(genMap, positions, isLR) {
    var bandsEl = document.getElementById('svg-bands');
    bandsEl.innerHTML = '';
    if (!Object.keys(positions).length) return;
    var groups = App.groupByGeneration(genMap);
    var genNums = Object.keys(groups).map(Number).sort(function(a,b){return a-b;});
    // 柔和中性的世代背景
    var BAND_COLORS = ['#fafafa','#f5f5f5','#fafafa','#f0f0f0','#fafafa','#f5f5f5'];
    genNums.forEach(function(gen, idx) {
      var ids = groups[gen];
      var posArr = ids.map(function(id){return positions[id];}).filter(Boolean);
      if (!posArr.length) return;
      var color = BAND_COLORS[idx % BAND_COLORS.length];
      if (!isLR) {
        var ys = posArr.map(function(p){return p.y;});
        var bandY = Math.min.apply(null,ys) - App.NODE_H/2 - 20;
        bandsEl.appendChild(svgEl('rect',{x:-5000,y:bandY,width:10000,height:App.NODE_H+40,fill:color,opacity:0.8}));
      } else {
        var xs = posArr.map(function(p){return p.x;});
        var bandX = Math.min.apply(null,xs) - App.NODE_W/2 - 20;
        bandsEl.appendChild(svgEl('rect',{x:bandX,y:-5000,width:App.NODE_W+40,height:10000,fill:color,opacity:0.8}));
      }
    });
  }

  function renderEdges(state, positions) {
    var edgesEl = document.getElementById('svg-edges');
    edgesEl.innerHTML = '';
    var isLR = state.layout === 'left-right';
    var NW = App.NODE_W, NH = App.NODE_H;

    function addEdge(pathD, strokeColor, strokeDash, strokeW, relId, notes, hideVisual) {
      if (!pathD) return;
      var hitPath = svgEl('path',{d:pathD,fill:'none',stroke:'transparent','stroke-width':12,cursor:'pointer','data-rel-id':relId});
      hitPath.addEventListener('click',function(e){e.stopPropagation();App.openEdgePopover(relId,e);});
      edgesEl.appendChild(hitPath);
      if (!hideVisual) {
        var visPath = svgEl('path',{d:pathD,fill:'none',stroke:strokeColor,'stroke-width':strokeW,'stroke-dasharray':strokeDash||'','pointer-events':'none'});
        edgesEl.appendChild(visPath);
      }
      if (notes) {
        var pts = getPathMidpoint(pathD);
        edgesEl.appendChild(svgEl('circle',{cx:pts.x,cy:pts.y,r:6,fill:'#e67e22',stroke:'#fff','stroke-width':1.5,'pointer-events':'none'}));
        var txt = svgEl('text',{x:pts.x+10,y:pts.y-4,'font-size':10,'font-family':'"Noto Serif SC","SimSun",serif',fill:'#333333','pointer-events':'none'});
        txt.textContent = notes.length>12?notes.slice(0,12)+'…':notes;
        edgesEl.appendChild(txt);
      }
    }

    var relations = state.relations || [];
    var idx = App.buildRelationIndex ? App.buildRelationIndex(state) : null;
    var renderedRelIds = new Set();
    var parentChildByPair = {};

    relations.forEach(function(rel) {
      if (rel.type !== 'parent-child') return;
      var pairKey = rel.fromId + '|' + rel.toId;
      if (!parentChildByPair[pairKey]) parentChildByPair[pairKey] = [];
      parentChildByPair[pairKey].push(rel);
    });

    function drawVisualPath(pathD, strokeColor, strokeDash, strokeW) {
      if (!pathD) return;
      var visPath = svgEl('path', {
        d: pathD,
        fill: 'none',
        stroke: strokeColor,
        'stroke-width': strokeW,
        'stroke-dasharray': strokeDash || '',
        'pointer-events': 'none'
      });
      edgesEl.appendChild(visPath);
    }

    function sortChildIds(childIds) {
      var ids = childIds.slice();
      ids.sort(function(a, b) {
        var oa = idx && idx.childOrderHint ? (idx.childOrderHint[a] || 0) : 0;
        var ob = idx && idx.childOrderHint ? (idx.childOrderHint[b] || 0) : 0;
        if (oa !== ob) return oa - ob;
        var pa = state.persons[a] || {};
        var pb = state.persons[b] || {};
        return (pa.name || a).localeCompare(pb.name || b);
      });
      return ids;
    }

    // 1) 按父母组渲染亲子线，确保单亲/双亲锚点规则一致
    var childGroups = {};
    Object.keys(state.persons || {}).forEach(function(childId) {
      var parentIds = idx ? (idx.parentIdsByChild[childId] || []) : [];
      parentIds = parentIds.slice().sort(function(a, b) { return a.localeCompare(b); }).slice(0, 2);
      if (!parentIds.length) return;
      var groupKey = parentIds.join('|');
      if (!childGroups[groupKey]) {
        childGroups[groupKey] = { parentIds: parentIds, childIds: [] };
      }
      childGroups[groupKey].childIds.push(childId);
    });

    var couplePairsWithChildren = new Set();
    Object.values(childGroups).forEach(function(group) {
      var parentIds = group.parentIds.slice();
      var childIds = sortChildIds(group.childIds);
      var childEntries = childIds.map(function(cid) {
        var cp = positions[cid];
        if (!cp) return null;
        if (!isLR) return { id: cid, x: cp.x, y: cp.y - NH / 2 };
        return { id: cid, x: cp.x - NW / 2, y: cp.y };
      }).filter(Boolean);

      if (!childEntries.length) return;

      var activeParents = parentIds.filter(function(pid) { return !!positions[pid]; });
      if (!activeParents.length) return;

      var hasCouple = false;
      var anchor = { x: 0, y: 0 };

      if (activeParents.length >= 2) {
        var p1 = positions[activeParents[0]];
        var p2 = positions[activeParents[1]];
        if (p1 && p2) {
          hasCouple = true;
          var left = (!isLR ? (p1.x <= p2.x) : (p1.y <= p2.y)) ? p1 : p2;
          var right = left === p1 ? p2 : p1;
          if (!isLR) {
            drawVisualPath(
              'M' + (left.x + NW / 2) + ',' + left.y + ' L' + (right.x - NW / 2) + ',' + right.y,
              '#999999',
              '',
              1.5
            );
            anchor.x = (left.x + right.x) / 2;
            anchor.y = left.y + NH / 2;
          } else {
            drawVisualPath(
              'M' + left.x + ',' + (left.y + NH / 2) + ' L' + right.x + ',' + (right.y - NH / 2),
              '#999999',
              '',
              1.5
            );
            anchor.x = left.x + NW / 2;
            anchor.y = (left.y + right.y) / 2;
          }
          couplePairsWithChildren.add(activeParents.slice(0, 2).sort().join('|'));
        }
      }

      if (!hasCouple) {
        var singleParentPos = positions[activeParents[0]];
        if (!singleParentPos) return;
        if (!isLR) {
          anchor.x = singleParentPos.x;
          anchor.y = singleParentPos.y + NH / 2;
        } else {
          anchor.x = singleParentPos.x + NW / 2;
          anchor.y = singleParentPos.y;
        }
      }

      if (childEntries.length === 1) {
        var one = childEntries[0];
        var onePath;
        if (!isLR) {
          if (Math.abs(one.x - anchor.x) < 1) onePath = 'M' + anchor.x + ',' + anchor.y + ' L' + one.x + ',' + one.y;
          else {
            var midY = anchor.y + (one.y - anchor.y) / 2;
            onePath = 'M' + anchor.x + ',' + anchor.y + ' L' + anchor.x + ',' + midY + ' L' + one.x + ',' + midY + ' L' + one.x + ',' + one.y;
          }
        } else {
          if (Math.abs(one.y - anchor.y) < 1) onePath = 'M' + anchor.x + ',' + anchor.y + ' L' + one.x + ',' + one.y;
          else {
            var midX = anchor.x + (one.x - anchor.x) / 2;
            onePath = 'M' + anchor.x + ',' + anchor.y + ' L' + midX + ',' + anchor.y + ' L' + midX + ',' + one.y + ' L' + one.x + ',' + one.y;
          }
        }
        drawVisualPath(onePath, '#888888', '', 1.5);
      } else {
        if (!isLR) {
          var childXs = childEntries.map(function(c) { return c.x; });
          var childTopY = Math.min.apply(null, childEntries.map(function(c) { return c.y; }));
          var collectY = anchor.y + Math.max(22, (childTopY - anchor.y) * 0.45);
          drawVisualPath('M' + anchor.x + ',' + anchor.y + ' L' + anchor.x + ',' + collectY, '#888888', '', 1.5);
          drawVisualPath('M' + Math.min.apply(null, childXs) + ',' + collectY + ' L' + Math.max.apply(null, childXs) + ',' + collectY, '#888888', '', 1.5);
          childEntries.forEach(function(c) {
            drawVisualPath('M' + c.x + ',' + collectY + ' L' + c.x + ',' + c.y, '#888888', '', 1.5);
          });
        } else {
          var childYs = childEntries.map(function(c) { return c.y; });
          var childLeftX = Math.min.apply(null, childEntries.map(function(c) { return c.x; }));
          var collectX = anchor.x + Math.max(22, (childLeftX - anchor.x) * 0.45);
          drawVisualPath('M' + anchor.x + ',' + anchor.y + ' L' + collectX + ',' + anchor.y, '#888888', '', 1.5);
          drawVisualPath('M' + collectX + ',' + Math.min.apply(null, childYs) + ' L' + collectX + ',' + Math.max.apply(null, childYs), '#888888', '', 1.5);
          childEntries.forEach(function(c) {
            drawVisualPath('M' + collectX + ',' + c.y + ' L' + c.x + ',' + c.y, '#888888', '', 1.5);
          });
        }
      }

      // 给每条父子关系挂上可点击路径，保持备注编辑能力
      childEntries.forEach(function(c) {
        var childPath;
        if (!isLR) {
          if (childEntries.length === 1 && Math.abs(c.x - anchor.x) < 1) childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + c.x + ',' + c.y;
          else if (childEntries.length === 1) {
            var midY1 = anchor.y + (c.y - anchor.y) / 2;
            childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + anchor.x + ',' + midY1 + ' L' + c.x + ',' + midY1 + ' L' + c.x + ',' + c.y;
          } else {
            var childTopY1 = Math.min.apply(null, childEntries.map(function(it) { return it.y; }));
            var collectY1 = anchor.y + Math.max(22, (childTopY1 - anchor.y) * 0.45);
            childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + anchor.x + ',' + collectY1 + ' L' + c.x + ',' + collectY1 + ' L' + c.x + ',' + c.y;
          }
        } else {
          if (childEntries.length === 1 && Math.abs(c.y - anchor.y) < 1) childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + c.x + ',' + c.y;
          else if (childEntries.length === 1) {
            var midX1 = anchor.x + (c.x - anchor.x) / 2;
            childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + midX1 + ',' + anchor.y + ' L' + midX1 + ',' + c.y + ' L' + c.x + ',' + c.y;
          } else {
            var childLeftX1 = Math.min.apply(null, childEntries.map(function(it) { return it.x; }));
            var collectX1 = anchor.x + Math.max(22, (childLeftX1 - anchor.x) * 0.45);
            childPath = 'M' + anchor.x + ',' + anchor.y + ' L' + collectX1 + ',' + anchor.y + ' L' + collectX1 + ',' + c.y + ' L' + c.x + ',' + c.y;
          }
        }

        activeParents.forEach(function(pid) {
          var pairKey = pid + '|' + c.id;
          (parentChildByPair[pairKey] || []).forEach(function(rel) {
            addEdge(childPath, '#888888', '', 1.5, rel.id, rel.notes, true);
            renderedRelIds.add(rel.id);
          });
        });
      });
    });

    // 2) 配偶关系：有共同子女的由家庭连线表现，其余保留虚线
    relations.forEach(function(rel) {
      if (rel.type !== 'spouse') return;
      var p1 = positions[rel.fromId];
      var p2 = positions[rel.toId];
      if (!p1 || !p2) return;
      var pairKey = [rel.fromId, rel.toId].sort().join('|');
      if (couplePairsWithChildren.has(pairKey)) return;
      var pathD = '';
      if (!isLR) pathD = 'M' + (p1.x + NW / 2) + ',' + p1.y + ' L' + (p2.x - NW / 2) + ',' + p2.y;
      else pathD = 'M' + p1.x + ',' + (p1.y + NH / 2) + ' L' + p2.x + ',' + (p2.y - NH / 2);
      addEdge(pathD, '#d48a9e', '4,3', 1.5, rel.id, rel.notes);
      renderedRelIds.add(rel.id);
    });

    // 3) 兄弟姐妹关系保持独立虚线
    relations.forEach(function(rel) {
      if (rel.type !== 'sibling') return;
      var p1 = positions[rel.fromId];
      var p2 = positions[rel.toId];
      if (!p1 || !p2) return;
      var pathD = '';
      if (!isLR) pathD = 'M' + (p1.x + NW / 2) + ',' + p1.y + ' Q' + ((p1.x + p2.x) / 2) + ',' + (p1.y - 20) + ' ' + (p2.x - NW / 2) + ',' + p2.y;
      else pathD = 'M' + p1.x + ',' + (p1.y + NH / 2) + ' Q' + (p1.x - 20) + ',' + ((p1.y + p2.y) / 2) + ' ' + p2.x + ',' + (p2.y - NH / 2);
      addEdge(pathD, '#aaaaaa', '3,3', 1.5, rel.id, rel.notes);
      renderedRelIds.add(rel.id);
    });

    // 4) 兜底：仍未绘制的亲子关系按普通折线渲染
    relations.forEach(function(rel) {
      if (rel.type !== 'parent-child') return;
      if (renderedRelIds.has(rel.id)) return;
      var p1 = positions[rel.fromId];
      var p2 = positions[rel.toId];
      if (!p1 || !p2) return;
      var pathD = '';
      if (!isLR) {
        var x1 = p1.x, y1 = p1.y + NH / 2, x2 = p2.x, y2 = p2.y - NH / 2;
        var midY = y1 + (y2 - y1) / 2;
        pathD = 'M' + x1 + ',' + y1 + ' L' + x1 + ',' + midY + ' L' + x2 + ',' + midY + ' L' + x2 + ',' + y2;
      } else {
        var xx1 = p1.x + NW / 2, yy1 = p1.y, xx2 = p2.x - NW / 2, yy2 = p2.y;
        var midX = xx1 + (xx2 - xx1) / 2;
        pathD = 'M' + xx1 + ',' + yy1 + ' L' + midX + ',' + yy1 + ' L' + midX + ',' + yy2 + ' L' + xx2 + ',' + yy2;
      }
      addEdge(pathD, '#888888', '', 1.5, rel.id, rel.notes);
    });
  }

  function renderNodes(state, positions) {
    var nodesEl = document.getElementById('svg-nodes');
    nodesEl.innerHTML = '';
    var NW = App.NODE_W, NH = App.NODE_H;

    Object.values(state.persons).forEach(function(person) {
      var pos = positions[person.id];
      if (!pos) return;
      var colors = nodeColors(person);
      var isSelected = person.id === App.selectedPersonId;
      var isDeceased = !!person.deathDate;
      var isHighlighted = App.searchHighlightIds.has(person.id);
      var isCurrent = person.id === App.searchCurrentId;

      var g = svgEl('g',{transform:'translate('+(pos.x-NW/2)+','+(pos.y-NH/2)+')',cursor:'pointer','data-person-id':person.id});
      // 柔和的阴影
      g.appendChild(svgEl('rect',{x:2,y:2,width:NW,height:NH,rx:4,fill:'rgba(0,0,0,0.06)','pointer-events':'none'}));
      // 主矩形
      g.appendChild(svgEl('rect',{x:0,y:0,width:NW,height:NH,rx:4,fill:colors.fill,
        stroke: isCurrent?'#e67e22': isSelected?'#e67e22': isHighlighted?'#e67e22':colors.stroke,
        'stroke-width': (isSelected||isCurrent)?2.5: isHighlighted?2:1.5,
        opacity:isDeceased?0.65:1,'stroke-dasharray':isDeceased?'4,3':''}));

      // 性别图标
      var genderIcon = person.gender==='male'?'♂':person.gender==='female'?'♀':'○';
      var iconEl = svgEl('text',{x:NW-14,y:15,'font-size':11,fill:colors.stroke,'pointer-events':'none','text-anchor':'middle','font-family':'serif'});
      iconEl.textContent = genderIcon;
      g.appendChild(iconEl);

      // 姓名
      var nameEl = svgEl('text',{x:NW/2,y:28,'font-size':14,'font-weight':'500','font-family':'"Noto Serif SC","SimSun",serif','letter-spacing':'0.05',fill:colors.text,'text-anchor':'middle','pointer-events':'none'});
      nameEl.textContent = person.name.length>8?person.name.slice(0,8)+'…':person.name;
      g.appendChild(nameEl);

      // 日期
      var dateStr = formatDateRange(person.birthDate, person.deathDate);
      if (dateStr) {
        var dateEl = svgEl('text',{x:NW/2,y:44,'font-size':10,'font-family':'"Noto Serif SC","SimSun",serif',fill:'#888888','text-anchor':'middle','pointer-events':'none'});
        dateEl.textContent = dateStr;
        g.appendChild(dateEl);
      }

      // 照片
      if (person.photoUrl) {
        var clipId = 'clip_'+person.id;
        var defs = svgEl('defs');
        var clip = svgEl('clipPath',{id:clipId});
        clip.appendChild(svgEl('rect',{x:4,y:4,width:30,height:30,rx:4}));
        defs.appendChild(clip); g.appendChild(defs);
        var imgEl = svgEl('image',{x:4,y:4,width:30,height:30,href:person.photoUrl,'clip-path':'url(#'+clipId+')','pointer-events':'none','preserveAspectRatio':'xMidYMid meet'});
        g.appendChild(imgEl);
      }

      g.addEventListener('click',function(e){e.stopPropagation();App.selectPerson(person.id);});
      g.addEventListener('dblclick',function(e){e.stopPropagation();App.openPersonModal(person.id);});
      g.addEventListener('contextmenu',function(e){e.preventDefault();e.stopPropagation();App.selectPerson(person.id);App.showContextMenu(e.clientX,e.clientY,person.id);});
      g.addEventListener('mousedown',function(e){if(e.button===0)initNodeDrag(e,person.id);});
      nodesEl.appendChild(g);
    });
  }

  App.renderAll = function() {
    var state = App.appState;
    var hasPersons = Object.keys(state.persons).length > 0;
    document.getElementById('empty-state').style.display = hasPersons ? 'none' : 'block';
    if (!hasPersons) {
      ['svg-bands','svg-edges','svg-nodes'].forEach(function(id){document.getElementById(id).innerHTML='';});
      App.updateSidebar();
      return;
    }
    App.cachedGenMap = App.computeGenerations(state);
    App.cachedPositions = App.computeLayout(state);
    var isLR = state.layout === 'left-right';
    renderBands(App.cachedGenMap, App.cachedPositions, isLR);
    renderEdges(state, App.cachedPositions);
    renderNodes(state, App.cachedPositions);
    App.applyViewport();
    App.updateSidebar();
  };

  App.applyViewport = function() {
    document.getElementById('svg-root').setAttribute('transform','translate('+App.vp.x+','+App.vp.y+') scale('+App.vp.scale+')');
    document.getElementById('zoom-indicator').textContent = Math.round(App.vp.scale*100)+'%';
  };

  App.fitToScreen = function() {
    if (!Object.keys(App.cachedPositions).length) return;
    var svg = document.getElementById('svg-canvas');
    var bbox = App.computeBBox(App.cachedPositions);
    var svgW = svg.clientWidth||800, svgH = svg.clientHeight||600;
    App.vp.scale = Math.min(svgW/bbox.w, svgH/bbox.h, 1.5)*0.9;
    App.vp.x = svgW/2-(bbox.minX+bbox.w/2)*App.vp.scale;
    App.vp.y = svgH/2-(bbox.minY+bbox.h/2)*App.vp.scale;
    App.applyViewport();
  };

  App.selectPerson = function(id) {
    App.selectedPersonId = id;
    var gen = App.cachedGenMap[id];
    if (gen !== undefined) App.setSelectedGen(gen);
    if (Object.keys(App.cachedPositions).length) renderNodes(App.appState, App.cachedPositions);
  };

  App.navigateWithArrow = function(e) {
    var currentId = App.selectedPersonId;
    if (!currentId) return;
    var state = App.appState;
    var positions = App.cachedPositions;
    if (!positions || !positions[currentId]) return;

    var currentPos = positions[currentId];
    var isLR = state.layout === 'left-right';

    var getRelatives = function() {
      var parents = App.getParents(currentId, state);
      var children = App.getChildren(currentId, state);
      var spouses = App.getSpouses(currentId, state);
      var siblings = App.getSiblings(currentId, state);
      var relMap = {};
      parents.forEach(function(p) {
        var rel = { person: p, type: 'parent', pos: positions[p.id] };
        if (!relMap[p.id] || rel.type === 'parent') { relMap[p.id] = rel; }
      });
      children.forEach(function(c) {
        var rel = { person: c, type: 'child', pos: positions[c.id] };
        if (!relMap[c.id] || rel.type === 'child') { relMap[c.id] = rel; }
      });
      spouses.forEach(function(s) {
        var rel = { person: s, type: 'spouse', pos: positions[s.id] };
        if (!relMap[s.id]) relMap[s.id] = rel;
      });
      siblings.forEach(function(s) {
        var rel = { person: s, type: 'sibling', pos: positions[s.id] };
        if (!relMap[s.id]) relMap[s.id] = rel;
      });
      return Object.values(relMap).filter(function(r) { return r.pos; });
    };

    var relatives = getRelatives();
    if (!relatives.length) return;

    var direction = e.key;
    var candidates = [];

    relatives.forEach(function(r) {
      var dx = r.pos.x - currentPos.x;
      var dy = r.pos.y - currentPos.y;
      if (isLR) {
        var temp = dx; dx = dy; dy = temp;
      }
      var dist = Math.sqrt(dx*dx + dy*dy);
      r._dx = dx; r._dy = dy; r._dist = dist;
    });

    if (direction === 'ArrowUp') {
      relatives.forEach(function(r) {
        var dy = isLR ? r._dx : r._dy;
        if (dy < 0) candidates.push(r);
      });
      // 父母优先选择最左边（x最小）的
      candidates.sort(function(a, b) {
        var parentBonusA = a.type === 'parent' ? -5000 : 0;
        var parentBonusB = b.type === 'parent' ? -5000 : 0;
        var posBonusA = a.type === 'parent' ? (isLR ? -a.pos.y : -a.pos.x) : 0;
        var posBonusB = b.type === 'parent' ? (isLR ? -b.pos.y : -b.pos.x) : 0;
        var scoreA = parentBonusA + posBonusA + Math.abs(isLR ? a._dx : a._dy) * 1000 + a._dist;
        var scoreB = parentBonusB + posBonusB + Math.abs(isLR ? b._dx : b._dy) * 1000 + b._dist;
        return scoreA - scoreB;
      });
    } else if (direction === 'ArrowDown') {
      relatives.forEach(function(r) {
        var dy = isLR ? r._dx : r._dy;
        if (dy > 0) candidates.push(r);
      });
      // 父母优先选择最左边（x最小）的
      candidates.sort(function(a, b) {
        var parentBonusA = a.type === 'parent' ? -5000 : 0;
        var parentBonusB = b.type === 'parent' ? -5000 : 0;
        var posBonusA = a.type === 'parent' ? (isLR ? -a.pos.y : -a.pos.x) : 0;
        var posBonusB = b.type === 'parent' ? (isLR ? -b.pos.y : -b.pos.x) : 0;
        var scoreA = parentBonusA + posBonusA + Math.abs(isLR ? a._dx : a._dy) * 1000 + a._dist;
        var scoreB = parentBonusB + posBonusB + Math.abs(isLR ? b._dx : b._dy) * 1000 + b._dist;
        return scoreA - scoreB;
      });
    } else if (direction === 'ArrowLeft') {
      relatives.forEach(function(r) {
        var dx = isLR ? r._dy : r._dx;
        if (dx < 0) candidates.push(r);
      });
      // 父母优先选择最上边（y最小）的
      candidates.sort(function(a, b) {
        var parentBonusA = a.type === 'parent' ? -5000 : 0;
        var parentBonusB = b.type === 'parent' ? -5000 : 0;
        var posBonusA = a.type === 'parent' ? (isLR ? -a.pos.x : -a.pos.y) : 0;
        var posBonusB = b.type === 'parent' ? (isLR ? -b.pos.x : -b.pos.y) : 0;
        var scoreA = parentBonusA + posBonusA + Math.abs(isLR ? a._dy : a._dx) * 1000 + a._dist;
        var scoreB = parentBonusB + posBonusB + Math.abs(isLR ? b._dy : b._dx) * 1000 + b._dist;
        return scoreA - scoreB;
      });
    } else if (direction === 'ArrowRight') {
      relatives.forEach(function(r) {
        var dx = isLR ? r._dy : r._dx;
        if (dx > 0) candidates.push(r);
      });
      // 父母优先选择最上边（y最小）的
      candidates.sort(function(a, b) {
        var parentBonusA = a.type === 'parent' ? -5000 : 0;
        var parentBonusB = b.type === 'parent' ? -5000 : 0;
        var posBonusA = a.type === 'parent' ? (isLR ? -a.pos.x : -a.pos.y) : 0;
        var posBonusB = b.type === 'parent' ? (isLR ? -b.pos.x : -b.pos.y) : 0;
        var scoreA = parentBonusA + posBonusA + Math.abs(isLR ? a._dy : a._dx) * 1000 + a._dist;
        var scoreB = parentBonusB + posBonusB + Math.abs(isLR ? b._dy : b._dx) * 1000 + b._dist;
        return scoreA - scoreB;
      });
    }

    if (candidates.length > 0) {
      App.selectPerson(candidates[0].person.id);
    }
  };

  // Convert screen coords to SVG world coords
  function toSvgCoords(clientX, clientY) {
    var svg = document.getElementById('svg-canvas');
    var rect = svg.getBoundingClientRect();
    return { x:(clientX-rect.left-App.vp.x)/App.vp.scale, y:(clientY-rect.top-App.vp.y)/App.vp.scale };
  }

  // Drag-and-drop for sibling reordering
  function getSiblingsByParent(personId, state) {
    var idx = App.buildRelationIndex ? App.buildRelationIndex(state) : null;
    if (!idx) return null;
    var groupParents = (idx.parentIdsByChild[personId] || []).slice().sort(function(a, b) { return a.localeCompare(b); }).slice(0, 2);
    if (!groupParents.length) return null;
    var parentKey = groupParents.join('|');

    var bestSiblings = Object.keys(state.persons || {}).filter(function(cid) {
      var cidParents = (idx.parentIdsByChild[cid] || []).slice().sort(function(a, b) { return a.localeCompare(b); }).slice(0, 2);
      return cidParents.join('|') === parentKey;
    });

    if (bestSiblings.length < 2) return null;

    // 收集每个兄弟节点的配偶信息（同世代的配偶）
    var genMap = App.cachedGenMap || {};
    var siblingSpouses = {};
    bestSiblings.forEach(function(sid) {
      var spouses = App.getSpouses(sid, state).filter(function(sp) {
        // 如果 genMap 为空，默认为同世代
        var sidGen = genMap[sid];
        var spGen = genMap[sp.id];
        if (sidGen === undefined || spGen === undefined) return true;
        return spGen === sidGen;
      }).map(function(sp) { return sp.id; });
      if (spouses.length > 0) {
        siblingSpouses[sid] = spouses;
      }
    });

    return {
      parentIds: groupParents,
      parentKey: parentKey,
      siblings: bestSiblings,
      siblingSpouses: siblingSpouses
    };
  }

  // Alt+拖拽建立关系
  function initRelationDrag(e, fromPersonId) {
    e.preventDefault();
    e.stopPropagation();

    var startX = e.clientX, startY = e.clientY;
    var moved = false;
    var ghost = null;
    var targetPersonId = null;

    function onMove(ev) {
      ev.preventDefault();
      if (!moved && Math.abs(ev.clientX-startX)+Math.abs(ev.clientY-startY) < 5) return;

      if (!moved) {
        moved = true;
        document.body.style.userSelect = 'none';
        document.getElementById('svg-canvas').classList.add('dragging-node');

        var nodesEl = document.getElementById('svg-nodes');
        var origG = nodesEl.querySelector('[data-person-id="'+fromPersonId+'"]');
        if (origG) {
          ghost = origG.cloneNode(true);
          ghost.style.opacity = '0.5';
          ghost.style.pointerEvents = 'none';
          ghost.setAttribute('data-ghost','1');
          nodesEl.appendChild(ghost);
        }
      }

      if (!ghost) return;

      var svgPos = toSvgCoords(ev.clientX, ev.clientY);
      ghost.setAttribute('transform','translate('+(svgPos.x-App.NODE_W/2)+','+(svgPos.y-App.NODE_H/2)+')');

      // 检测悬停在哪个节点上（排除幽灵节点）
      var newTarget = null;
      document.querySelectorAll('[data-person-id]:not([data-ghost])').forEach(function(node) {
        var pid = node.getAttribute('data-person-id');
        if (pid === fromPersonId) return;

        var rect = node.getBoundingClientRect();
        if (ev.clientX >= rect.left && ev.clientX <= rect.right &&
            ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          newTarget = pid;
          // 使用 stroke 高亮而不是 filter（SVG 兼容性更好）
          var rectEl = node.querySelector('rect');
          if (rectEl) rectEl.style.stroke = '#e67e22';
        } else {
          var rectEl = node.querySelector('rect');
          if (rectEl) rectEl.style.stroke = '';
        }
      });

      targetPersonId = newTarget;
    }

    function onUp(ev) {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.getElementById('svg-canvas').classList.remove('dragging-node');

      if (ghost) { ghost.parentNode && ghost.parentNode.removeChild(ghost); }

      // 清除高亮
      document.querySelectorAll('[data-person-id]:not([data-ghost])').forEach(function(node) {
        var rectEl = node.querySelector('rect');
        if (rectEl) rectEl.style.stroke = '';
      });

      if (moved && targetPersonId) {
        // 延迟显示菜单，避免被 click 事件立即关闭
        setTimeout(function() {
          App.showRelationMenu(ev.clientX, ev.clientY, fromPersonId, targetPersonId);
        }, 10);
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function initNodeDrag(e, personId) {
    // Alt+拖拽：建立关系
    if (e.altKey) {
      initRelationDrag(e, personId);
      return;
    }

    // 普通拖拽：排序
    var info = getSiblingsByParent(personId, App.appState);
    if (!info) return;
    var startX = e.clientX, startY = e.clientY;
    var moved = false;
    var ghost = null, indicator = null;
    var dropBeforeId = null; // 放在此节点之前（null = 放到末尾）
    var sortedSibsSnap = null; // 拖拽开始时按位置排序的兄弟列表
    var siblingSpouses = info.siblingSpouses; // 每个兄弟节点的配偶信息

    // 获取节点及其配偶的右边界位置（纵向布局用x，横向布局用y）
    function getNodeEndPos(nodeId, axis) {
      var pos = App.cachedPositions[nodeId];
      if (!pos) return null;
      var endPos = pos[axis];
      // 如果有配偶，配偶在节点后面，需要考虑配偶的位置
      var spouses = siblingSpouses[nodeId];
      if (spouses) {
        spouses.forEach(function(spId) {
          var spPos = App.cachedPositions[spId];
          if (spPos && spPos[axis] > endPos) {
            endPos = spPos[axis];
          }
        });
      }
      return endPos;
    }

    // 获取节点及其配偶的起始位置
    function getNodeStartPos(nodeId, axis) {
      var pos = App.cachedPositions[nodeId];
      if (!pos) return null;
      return pos[axis];
    }

    function onMove(ev) {
      if (!moved && Math.abs(ev.clientX-startX)+Math.abs(ev.clientY-startY) < 5) return;
      if (!moved) {
        moved = true;
        // 禁止文字选中，避免拖拽时节点文字被高亮选中
        document.body.style.userSelect = 'none';
        document.getElementById('svg-canvas').classList.add('dragging-node');
        var nodesEl = document.getElementById('svg-nodes');
        var origG = nodesEl.querySelector('[data-person-id="'+personId+'"]');
        if (origG) {
          ghost = origG.cloneNode(true);
          ghost.style.opacity = '0.5';
          ghost.style.pointerEvents = 'none';
          ghost.setAttribute('data-ghost','1');
          nodesEl.appendChild(ghost);
        }
        indicator = svgEl('line',{x1:0,y1:0,x2:0,y2:0,stroke:'#3b82f6','stroke-width':3,'stroke-linecap':'round','pointer-events':'none'});
        document.getElementById('svg-edges').appendChild(indicator);
        dragState = {
          personId: personId,
          parentIds: info.parentIds || [],
          parentKey: info.parentKey || '',
          siblings: info.siblings,
          siblingSpouses: siblingSpouses
        };
      }
      if (!ghost || !dragState) return;

      var svgPos = toSvgCoords(ev.clientX, ev.clientY);
      ghost.setAttribute('transform','translate('+(svgPos.x-App.NODE_W/2)+','+(svgPos.y-App.NODE_H/2)+')');

      var isLR = App.appState.layout === 'left-right';
      var axis = isLR ? 'y' : 'x';
      var NW = App.NODE_W, NH = App.NODE_H;

      // 按当前视觉位置排序所有兄弟（包含被拖拽节点）
      sortedSibsSnap = dragState.siblings.slice().sort(function(a, b) {
        var pa = App.cachedPositions[a], pb = App.cachedPositions[b];
        if (!pa || !pb) return 0;
        return pa[axis] - pb[axis];
      });

      // 找到应该插在哪个节点之前（跳过被拖拽节点自身）
      // 关键修改：需要考虑配偶节点的位置，判断鼠标是在节点+配偶组合的左边还是右边
      dropBeforeId = null;
      for (var i = 0; i < sortedSibsSnap.length; i++) {
        var sid = sortedSibsSnap[i];
        if (sid === personId) continue;
        var nodeStart = getNodeStartPos(sid, axis);
        var nodeEnd = getNodeEndPos(sid, axis);
        var nodeCenter = (nodeStart + nodeEnd) / 2;
        // 如果鼠标位置在节点中心左边，则插入到这个节点之前
        if (svgPos[axis] < nodeCenter) {
          dropBeforeId = sid;
          break;
        }
      }

      // 更新指示线位置
      if (indicator) {
        var refPos = null;
        var showAfter = false; // true = 显示在节点右侧/下方

        if (dropBeforeId !== null) {
          refPos = App.cachedPositions[dropBeforeId];
          showAfter = false; // 显示在目标节点左侧/上方
        } else {
          // 放到末尾：显示在最后一个非自身节点的右侧/下方（需要考虑配偶）
          for (var j = sortedSibsSnap.length - 1; j >= 0; j--) {
            if (sortedSibsSnap[j] !== personId) {
              refPos = App.cachedPositions[sortedSibsSnap[j]];
              showAfter = true;
              break;
            }
          }
        }

        if (refPos) {
          var GAP = 10;
          // 如果是显示在节点后面，且该节点有配偶，需要显示在配偶后面
          var targetX = refPos.x;
          var targetY = refPos.y;
          if (showAfter) {
            var lastSibId = sortedSibsSnap[j];
            var spouses = siblingSpouses[lastSibId];
            if (spouses) {
              // 找到最右/最下的配偶位置
              spouses.forEach(function(spId) {
                var spPos = App.cachedPositions[spId];
                if (spPos) {
                  if (!isLR && spPos.x > targetX) targetX = spPos.x;
                  if (isLR && spPos.y > targetY) targetY = spPos.y;
                }
              });
            }
          }

          if (!isLR) {
            // 纵向布局：指示线是垂直线，显示在节点左侧或右侧
            var ix = showAfter ? (targetX + NW/2 + GAP) : (targetX - NW/2 - GAP);
            indicator.setAttribute('x1', ix);
            indicator.setAttribute('x2', ix);
            indicator.setAttribute('y1', refPos.y - NH/2 - 10);
            indicator.setAttribute('y2', refPos.y + NH/2 + 10);
          } else {
            // 横向布局：指示线是水平线，显示在节点上方或下方
            var iy = showAfter ? (targetY + NH/2 + GAP) : (targetY - NH/2 - GAP);
            indicator.setAttribute('x1', refPos.x - NW/2 - 10);
            indicator.setAttribute('x2', refPos.x + NW/2 + 10);
            indicator.setAttribute('y1', iy);
            indicator.setAttribute('y2', iy);
          }
          indicator.style.display = '';
        } else {
          indicator.style.display = 'none';
        }
      }
    }

    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.getElementById('svg-canvas').classList.remove('dragging-node');
      if (ghost) { ghost.parentNode && ghost.parentNode.removeChild(ghost); ghost = null; }
      if (indicator) { indicator.parentNode && indicator.parentNode.removeChild(indicator); indicator = null; }
      if (!moved || !dragState || !sortedSibsSnap) { dragState = null; return; }

      var ds = dragState; dragState = null;

      // 从排序列表中移除被拖拽节点，再插入到目标位置
      var newOrder = sortedSibsSnap.filter(function(id){ return id !== ds.personId; });
      var insertIdx;
      if (dropBeforeId !== null) {
        insertIdx = newOrder.indexOf(dropBeforeId);
        if (insertIdx === -1) insertIdx = newOrder.length;
      } else {
        insertIdx = newOrder.length; // 放到末尾
      }
      newOrder.splice(insertIdx, 0, ds.personId);

      App.history.execute(function(state) {
        newOrder.forEach(function(sid, idx) {
          // 同父母组统一顺序：只更新本组父母到该子女的关系，避免污染其他分支
          state.relations.forEach(function(r) {
            if (r.type === 'parent-child' && r.toId === sid && ds.parentIds.indexOf(r.fromId) !== -1) {
              r.order = idx;
            }
          });
        });
      }, '调整兄弟顺序');
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  App.initViewport = function() {
    var svg = document.getElementById('svg-canvas');
    svg.addEventListener('mousedown',function(e){
      if (e.button!==0) return;
      if (e.target.closest('[data-person-id]')||e.target.closest('[data-rel-id]')) return;
      isPanning=true; panStart={x:e.clientX,y:e.clientY}; vpStart={x:App.vp.x,y:App.vp.y};
      svg.classList.add('grabbing');
      App.closeContextMenu(); App.closeEdgePopover();
    });
    window.addEventListener('mousemove',function(e){
      if (!isPanning) return;
      App.vp.x=vpStart.x+(e.clientX-panStart.x); App.vp.y=vpStart.y+(e.clientY-panStart.y);
      App.applyViewport();
    });
    window.addEventListener('mouseup',function(){
      if (isPanning){isPanning=false;document.getElementById('svg-canvas').classList.remove('grabbing');}
    });
    svg.addEventListener('wheel',function(e){
      e.preventDefault();
      var rect=svg.getBoundingClientRect(),mx=e.clientX-rect.left,my=e.clientY-rect.top;
      var delta=e.deltaY>0?0.9:1.1;
      var newScale=Math.max(0.1,Math.min(4,App.vp.scale*delta));
      App.vp.x=mx-(mx-App.vp.x)*(newScale/App.vp.scale);
      App.vp.y=my-(my-App.vp.y)*(newScale/App.vp.scale);
      App.vp.scale=newScale; App.applyViewport();
    },{passive:false});
    svg.addEventListener('click',function(e){
      if (!e.target.closest('[data-person-id]')){App.selectPerson(null);App.closeContextMenu();}
    });
    svg.addEventListener('dblclick',function(e){
      // 双击空白处添加新节点
      if (e.target.closest('[data-person-id]') || e.target.closest('[data-rel-id]')) return;
      App.openPersonModal(null);
    });
    svg.addEventListener('contextmenu',function(e){e.preventDefault();});
  };

})(window.App = window.App || {});
