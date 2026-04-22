(function(App) {
  var toastTimer = null;
  App.showToast = function(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){t.classList.remove('show');}, 2500);
  };

  // 侧边栏切换
  App.toggleSidebar = function() {
    var sidebar = document.getElementById('sidebar');
    var btn = document.getElementById('btn-toggle-sidebar');
    if (sidebar) {
      sidebar.classList.toggle('hidden');
      if (btn) btn.classList.toggle('active', sidebar.classList.contains('hidden'));
      // 保存状态
      try {
        localStorage.setItem('jiapu-sidebar-hidden', sidebar.classList.contains('hidden'));
      } catch(e) {}
    }
  };

  // 恢复侧边栏状态
  function restoreSidebarState() {
    try {
      var hidden = localStorage.getItem('jiapu-sidebar-hidden') === 'true';
      var sidebar = document.getElementById('sidebar');
      var btn = document.getElementById('btn-toggle-sidebar');
      if (hidden && sidebar) {
        sidebar.classList.add('hidden');
        if (btn) btn.classList.add('active');
      }
    } catch(e) {}
  }

  var ctxPersonId = null;
  App.showContextMenu = function(x, y, personId) {
    ctxPersonId = personId;
    var menu = document.getElementById('ctx-menu');
    menu.style.display = 'block'; menu.style.left = x+'px'; menu.style.top = y+'px';
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x-rect.width)+'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y-rect.height)+'px';
    menu.focus();
  };
  App.closeContextMenu = function() {
    document.getElementById('ctx-menu').style.display = 'none'; ctxPersonId = null;
  };

  App.closeToolbarMoreMenu = function() {
    var wrap = document.getElementById('toolbar-more-wrap');
    if (!wrap) return;
    wrap.classList.remove('open');
  };

  function updatePhotoRemoveBtn() {
    var removeBtn = document.getElementById('f-photo-remove');
    var preview = document.getElementById('photo-preview');
    if (!removeBtn || !preview) return;
    var hasPhoto = preview.style.display !== 'none' && !!preview.src;
    removeBtn.disabled = !hasPhoto;
  }

  App.openPhotoViewer = function(photoUrl, personName) {
    if (!photoUrl) return;
    var overlay = document.getElementById('photo-viewer-overlay');
    var img = document.getElementById('photo-viewer-image');
    if (!overlay || !img) return;
    img.src = photoUrl;
    img.alt = (personName || '人物') + ' 大图预览';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
  };

  App.closePhotoViewer = function() {
    var overlay = document.getElementById('photo-viewer-overlay');
    var img = document.getElementById('photo-viewer-image');
    if (!overlay || !img) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    img.src = '';
  };

  var modalMode = 'add', modalPersonId = null, pendingRelation = null;
  App.openPersonModal = function(personId, addRelation) {
    modalPersonId = personId; pendingRelation = addRelation || null;
    var overlay = document.getElementById('modal-overlay');
    var title = document.getElementById('modal-title');
    var deleteBtn = document.getElementById('modal-delete-btn');
    if (personId) {
      modalMode = 'edit'; title.textContent = '编辑人物信息'; deleteBtn.style.display = 'inline-block';
      var p = App.appState.persons[personId];
      document.getElementById('f-name').value = p.name||'';
      document.querySelector('input[name="gender"][value="'+(p.gender||'unknown')+'"]').checked = true;
      document.getElementById('f-birth').value = p.birthDate||'';
      document.getElementById('f-death').value = p.deathDate||'';
      document.getElementById('f-birthplace').value = p.birthPlace||'';
      document.getElementById('f-notes').value = p.notes||'';
      var preview = document.getElementById('photo-preview');
      if (p.photoUrl){preview.src=p.photoUrl;preview.style.display='block';}
      else { preview.src=''; preview.style.display='none'; }
    } else {
      modalMode = 'add';
      title.textContent = addRelation ? ('添加'+relationLabel(addRelation.relationType)) : '添加人物';
      deleteBtn.style.display = 'none';
      document.getElementById('f-name').value = '';
      document.querySelector('input[name="gender"][value="unknown"]').checked = true;
      ['f-birth','f-death','f-birthplace','f-notes'].forEach(function(id){document.getElementById(id).value='';});
      document.getElementById('photo-preview').src = '';
      document.getElementById('photo-preview').style.display = 'none';
      document.getElementById('f-photo').value = '';
      if (addRelation && addRelation.relationType === 'add-spouse') {
        var ref = App.appState.persons[addRelation.relatedId];
        if (ref) {
          var opp = ref.gender==='male'?'female':ref.gender==='female'?'male':'unknown';
          document.querySelector('input[name="gender"][value="'+opp+'"]').checked = true;
        }
      }
    }
    updatePhotoRemoveBtn();
    overlay.classList.add('open');
    setTimeout(function(){document.getElementById('f-name').focus();}, 50);
  };

  function relationLabel(type) {
    return {'add-spouse':'配偶','add-child':'子女','add-parent':'父母','add-sibling':'兄弟姐妹'}[type]||'人物';
  }

  App.closePersonModal = function() {
    document.getElementById('modal-overlay').classList.remove('open');
    modalPersonId = null; pendingRelation = null;
  };

  function savePersonModal() {
    var name = document.getElementById('f-name').value.trim();
    if (!name) { App.showToast('请输入姓名'); return; }
    var gender = document.querySelector('input[name="gender"]:checked').value;
    var birthDate = document.getElementById('f-birth').value.trim();
    var deathDate = document.getElementById('f-death').value.trim();
    var birthPlace = document.getElementById('f-birthplace').value.trim();
    var notes = document.getElementById('f-notes').value.trim();
    var preview = document.getElementById('photo-preview');
    var photoUrl = preview.style.display !== 'none' ? preview.src : null;
    if (modalMode === 'edit' && modalPersonId) {
      App.history.execute(App.mutations.updatePerson(modalPersonId,{name:name,gender:gender,birthDate:birthDate,deathDate:deathDate,birthPlace:birthPlace,notes:notes,photoUrl:photoUrl}),'编辑 '+name);
    } else {
      var newPerson = App.createPerson({name:name,gender:gender,birthDate:birthDate,deathDate:deathDate,birthPlace:birthPlace,notes:notes,photoUrl:photoUrl});
      var pr = pendingRelation;
      var relationMessage = '';
      App.history.execute(function(state) {
        state.persons[newPerson.id] = newPerson;
        if (!state.rootPersonId) state.rootPersonId = newPerson.id;
        if (pr) {
          var relationType = null;
          var relFrom = null;
          var relTo = null;
          if (pr.relationType === 'add-spouse') {
            relationType = 'spouse';
            relFrom = pr.relatedId;
            relTo = newPerson.id;
          } else if (pr.relationType === 'add-child') {
            relationType = 'parent';
            relFrom = pr.relatedId;
            relTo = newPerson.id;
          } else if (pr.relationType === 'add-parent') {
            relationType = 'parent';
            relFrom = newPerson.id;
            relTo = pr.relatedId;
          } else if (pr.relationType === 'add-sibling') {
            relationType = 'sibling';
            relFrom = pr.relatedId;
            relTo = newPerson.id;
          }
          if (relationType && relFrom && relTo) {
            var relationResult = applyRelationBetween(state, relFrom, relTo, relationType);
            relationMessage = relationResult.msg || '';
          }
        }
      }, '添加 '+name);
      if (relationMessage && relationMessage.indexOf('已建立') === -1 && relationMessage.indexOf('已更新') === -1) {
        App.showToast('已添加 ' + name + '（关系处理：' + relationMessage + '）');
        App.closePersonModal();
        return;
      }
    }
    App.closePersonModal();
    App.showToast(modalMode==='edit'?('已更新 '+name):('已添加 '+name));
  }

  var edgePopoverRelId = null;
  App.openEdgePopover = function(relId, e) {
    edgePopoverRelId = relId;
    var rel = App.appState.relations.find(function(r){return r.id===relId;});
    if (!rel) return;
    var pop = document.getElementById('edge-popover');
    document.getElementById('edge-note-input').value = rel.notes||'';
    pop.style.display = 'block';
    pop.style.left = (e.clientX+8)+'px'; pop.style.top = (e.clientY-20)+'px';
    setTimeout(function(){document.getElementById('edge-note-input').focus();},50);
  };
  App.closeEdgePopover = function() {
    document.getElementById('edge-popover').style.display = 'none'; edgePopoverRelId = null;
  };
  function saveEdgeNote() {
    if (!edgePopoverRelId) return;
    var note = document.getElementById('edge-note-input').value.trim();
    App.history.execute(App.mutations.updateRelation(edgePopoverRelId,{notes:note}),'编辑连线备注');
    App.closeEdgePopover(); App.showToast('备注已保存');
  }

  App.openSavePopover = function() {
    var pop = document.getElementById('save-popover');
    var input = document.getElementById('save-label-input');
    var now = new Date();
    input.value = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0')+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
    pop.style.display = 'block';
    var btnRect = document.getElementById('btn-save').getBoundingClientRect();
    pop.style.left = (btnRect.left)+'px'; pop.style.top = (btnRect.bottom+4)+'px';
    setTimeout(function(){input.focus();input.select();},50);
  };
  App.closeSavePopover = function() {
    document.getElementById('save-popover').style.display = 'none';
  };

  // 关系菜单（Alt+拖拽建立关系）
  var relationMenuFromId = null;
  var relationMenuToId = null;

  App.showRelationMenu = function(x, y, fromId, toId) {
    var menu = document.getElementById('relation-menu');
    if (!menu) return;

    relationMenuFromId = fromId;
    relationMenuToId = toId;

    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
    menu.focus();
  };

  App.closeRelationMenu = function() {
    document.getElementById('relation-menu').style.display = 'none';
    relationMenuFromId = null;
    relationMenuToId = null;
  };

  // 检查是否会导致关系循环（不合理的关系）
  function wouldCreateCycle(state, newParentId, newChildId) {
    // 检查newChildId是否已经是newParentId的祖先
    var visited = new Set();
    var queue = [newParentId];
    while (queue.length > 0) {
      var current = queue.shift();
      if (current === newChildId) return true; // 会形成循环
      if (visited.has(current)) continue;
      visited.add(current);
      // 查找current的所有父母
      var parentRels = state.relations.filter(function(r) {
        return r.type === 'parent-child' && r.toId === current;
      });
      parentRels.forEach(function(r) {
        queue.push(r.fromId);
      });
    }
    return false;
  }

  function normalizePair(a, b) {
    return a < b ? [a, b] : [b, a];
  }

  function hasRelation(state, type, fromId, toId) {
    return state.relations.some(function(r) {
      if (r.type !== type) return false;
      if (type === 'spouse' || type === 'sibling') {
        var p = normalizePair(r.fromId, r.toId);
        var t = normalizePair(fromId, toId);
        return p[0] === t[0] && p[1] === t[1];
      }
      return r.fromId === fromId && r.toId === toId;
    });
  }

  function removeAllParents(state, childId) {
    state.relations = state.relations.filter(function(r) {
      return !(r.type === 'parent-child' && r.toId === childId);
    });
  }

  function collectParentIds(state, childId) {
    var set = new Set();
    state.relations.forEach(function(r) {
      if (r.type === 'parent-child' && r.toId === childId) set.add(r.fromId);
    });
    return Array.from(set).sort();
  }

  function nextOrderForParents(state, parentIds) {
    var maxOrder = -1;
    state.relations.forEach(function(r) {
      if (r.type !== 'parent-child') return;
      if (parentIds.indexOf(r.fromId) === -1) return;
      var ord = (typeof r.order === 'number') ? r.order : 0;
      if (ord > maxOrder) maxOrder = ord;
    });
    return maxOrder + 1;
  }

  function addParentChild(state, parentId, childId, order) {
    if (hasRelation(state, 'parent-child', parentId, childId)) return false;
    state.relations.push(App.createRelation({
      type: 'parent-child',
      fromId: parentId,
      toId: childId,
      order: (typeof order === 'number') ? order : 0
    }));
    return true;
  }

  function applyRelationBetween(state, fromId, toId, relationType) {
    if (!state.persons[fromId] || !state.persons[toId]) return { changed: false, msg: '节点不存在' };
    if (fromId === toId) return { changed: false, msg: '不能和自己建立该关系' };

    if (relationType === 'child') {
      return applyRelationBetween(state, toId, fromId, 'parent');
    }

    if (relationType === 'spouse') {
      if (hasRelation(state, 'spouse', fromId, toId)) return { changed: false, msg: '配偶关系已存在' };
      state.relations.push(App.createRelation({ type: 'spouse', fromId: fromId, toId: toId }));

      var changed = true;
      var fromChildren = App.getChildren(fromId, state);
      var toChildren = App.getChildren(toId, state);
      fromChildren.forEach(function(child) {
        var srcRel = state.relations.find(function(r) {
          return r.type === 'parent-child' && r.fromId === fromId && r.toId === child.id;
        });
        var order = srcRel ? (srcRel.order || 0) : 0;
        if (addParentChild(state, toId, child.id, order)) changed = true;
      });
      toChildren.forEach(function(child) {
        var srcRel = state.relations.find(function(r) {
          return r.type === 'parent-child' && r.fromId === toId && r.toId === child.id;
        });
        var order = srcRel ? (srcRel.order || 0) : 0;
        if (addParentChild(state, fromId, child.id, order)) changed = true;
      });
      return { changed: changed, msg: '关系已建立: spouse' };
    }

    if (relationType === 'parent') {
      if (wouldCreateCycle(state, fromId, toId)) return { changed: false, msg: '无法建立关系：不能让自己成为自己的祖先' };
      var spouses = App.getSpouses(fromId, state).map(function(p) { return p.id; }).slice(0, 1);
      var parentGroup = [fromId].concat(spouses);
      var order = nextOrderForParents(state, parentGroup);

      removeAllParents(state, toId);
      var changedParent = addParentChild(state, fromId, toId, order);
      spouses.forEach(function(spId) {
        if (!wouldCreateCycle(state, spId, toId)) {
          addParentChild(state, spId, toId, order);
        }
      });
      return { changed: changedParent, msg: changedParent ? '关系已建立: parent' : '关系未变化' };
    }

    if (relationType === 'sibling') {
      var fromParents = collectParentIds(state, fromId);
      var toParents = collectParentIds(state, toId);

      if (!fromParents.length && !toParents.length) {
        if (hasRelation(state, 'sibling', fromId, toId)) return { changed: false, msg: '兄弟姐妹关系已存在' };
        state.relations.push(App.createRelation({ type: 'sibling', fromId: fromId, toId: toId }));
        return { changed: true, msg: '关系已建立: sibling' };
      }

      if (fromParents.length && !toParents.length) {
        var ordA = nextOrderForParents(state, fromParents);
        var changedA = false;
        fromParents.forEach(function(pid) {
          if (!wouldCreateCycle(state, pid, toId)) {
            if (addParentChild(state, pid, toId, ordA)) changedA = true;
          }
        });
        return { changed: changedA, msg: changedA ? '关系已建立: sibling' : '关系未变化' };
      }

      if (!fromParents.length && toParents.length) {
        var ordB = nextOrderForParents(state, toParents);
        var changedB = false;
        toParents.forEach(function(pid) {
          if (!wouldCreateCycle(state, pid, fromId)) {
            if (addParentChild(state, pid, fromId, ordB)) changedB = true;
          }
        });
        return { changed: changedB, msg: changedB ? '关系已建立: sibling' : '关系未变化' };
      }

      // 双方都有父母时，以 toId 的父母组为准，统一关系树
      var ordC = nextOrderForParents(state, toParents);
      removeAllParents(state, fromId);
      var changedC = false;
      toParents.forEach(function(pid) {
        if (!wouldCreateCycle(state, pid, fromId)) {
          if (addParentChild(state, pid, fromId, ordC)) changedC = true;
        }
      });
      return { changed: changedC, msg: changedC ? '关系已建立: sibling' : '关系未变化' };
    }

    return { changed: false, msg: '未知关系类型' };
  }

  App.createRelationBetween = function(fromId, toId, relationType) {
    var fromPerson = App.appState.persons[fromId];
    var toPerson = App.appState.persons[toId];

    if (!fromPerson || !toPerson) return;

    var draft = App.deepClone(App.appState);
    var preview = applyRelationBetween(draft, fromId, toId, relationType);
    if (!preview.changed) {
      App.showToast(preview.msg || '关系未变化');
      return;
    }

    App.history.execute(function(state) {
      applyRelationBetween(state, fromId, toId, relationType);
    }, '建立关系');

    App.showToast(preview.msg || ('关系已建立: ' + relationType));
  };

  function confirmSave() {
    var label = document.getElementById('save-label-input').value.trim();
    if (!label) { App.showToast('请输入版本名称'); return; }
    App.saveVersion(label);
    App.closeSavePopover();
  }

  var activeSidebarTab = 'generations';
  var expandedGens = new Set();
  var selectedGen = null;

  App.setSelectedGen = function(gen) {
    if (gen !== selectedGen) {
      selectedGen = gen;
      if (activeSidebarTab === 'generations') updateGenerationsTab();
    }
  };

  App.updateSidebar = function() {
    updateGenerationsTab();
    if (activeSidebarTab === 'stats') updateStatsTab();
    if (activeSidebarTab === 'history') App.updateHistoryPanel();
  };

  function updateGenerationsTab() {
    if (activeSidebarTab !== 'generations') return;
    var genMap = App.cachedGenMap;
    var groups = App.groupByGeneration(genMap);
    var genNums = Object.keys(groups).map(Number).sort(function(a,b){return a-b;});
    var container = document.getElementById('tab-generations');
    var html = '';
    genNums.forEach(function(gen) {
      var ids = groups[gen];
      var label = App.getGenName(gen, App.appState.generationNames||{});
      var isExpanded = expandedGens.has(gen);
      var isSelected = selectedGen === gen;
      html += '<div class="gen-item'+(isExpanded?' active':'')+(isSelected?' selected':'')+'" data-gen="'+gen+'">'
        +'<span class="gen-name" data-gen="'+gen+'" title="双击编辑">'+label+'</span>'
        +'<span class="gen-badge">'+ids.length+'人</span></div>';
      if (isExpanded) {
        html += '<div class="gen-people">';
        ids.forEach(function(id) {
          var p = App.appState.persons[id]; if (!p) return;
          var isPersonSelected = id === App.selectedPersonId;
          html += '<span class="gen-person-chip '+p.gender+(isPersonSelected?' selected':'')+'" data-focus-id="'+id+'" title="'+p.name+'">'+p.name+'</span>';
        });
        html += '</div>';
      }
    });
    if (!genNums.length) html = '<div style="color:var(--text-muted);font-size:13px;padding:12px 8px;text-align:center">暂无数据</div>';
    container.innerHTML = html;

    container.querySelectorAll('.gen-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.classList.contains('gen-name')) return;
        var gen = parseInt(el.dataset.gen);
        if (expandedGens.has(gen)) expandedGens.delete(gen); else expandedGens.add(gen);
        updateGenerationsTab();
      });
    });

    container.querySelectorAll('.gen-name').forEach(function(span) {
      span.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        var gen = parseInt(span.dataset.gen);
        var input = document.createElement('input');
        input.className = 'gen-name-input';
        input.value = span.textContent;
        span.parentNode.replaceChild(input, span);
        input.focus(); input.select();
        function commit() {
          var val = input.value.trim();
          if (val && val !== span.textContent) {
            App.history.execute(App.mutations.setGenerationName(gen, val), '修改世代名称');
          } else {
            updateGenerationsTab();
          }
        }
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', function(e) {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.removeEventListener('blur', commit); updateGenerationsTab(); }
        });
      });
    });

    container.querySelectorAll('[data-focus-id]').forEach(function(el) {
      el.addEventListener('click', function(e) { e.stopPropagation(); focusPerson(el.dataset.focusId); });
    });
  }

  function focusPerson(id) {
    if (App.expandPathToPerson) App.expandPathToPerson(id);
    App.selectPerson(id);
    var gen = App.cachedGenMap[id];
    if (gen !== undefined && gen !== selectedGen) {
      selectedGen = gen;
      if (activeSidebarTab === 'generations') updateGenerationsTab();
    }
    var pos = App.cachedPositions[id]; if (!pos) return;
    var svg = document.getElementById('svg-canvas');
    var cx = svg.clientWidth/2, cy = svg.clientHeight/2;
    App.vp.x = cx - pos.x*App.vp.scale;
    App.vp.y = cy - pos.y*App.vp.scale;
    App.applyViewport();
  }

  function updateStatsTab() {
    var stats = App.computeStats(App.appState);
    var container = document.getElementById('tab-stats');
    var mr = stats.total?Math.round(stats.male/stats.total*100):0;
    var fr = stats.total?Math.round(stats.female/stats.total*100):0;
    container.innerHTML = '<div class="stat-card"><h4>基本统计</h4>'
      +'<div class="stat-row"><span>总人数</span><span class="stat-val">'+stats.total+'</span></div>'
      +'<div class="stat-row"><span>男性</span><span class="stat-val">'+stats.male+' ('+mr+'%)</span></div>'
      +'<div class="stat-row"><span>女性</span><span class="stat-val">'+stats.female+' ('+fr+'%)</span></div>'
      +'<div class="stat-row"><span>已故</span><span class="stat-val">'+stats.deceased+'</span></div></div>'
      +'<div class="stat-card"><h4>世代信息</h4>'
      +'<div class="stat-row"><span>世代数</span><span class="stat-val">'+stats.genCount+'</span></div>'
      +(stats.avgLifespan?'<div class="stat-row"><span>平均寿命</span><span class="stat-val">'+stats.avgLifespan+'岁</span></div>':'')
      +(stats.oldest?'<div class="stat-row"><span>最年长在世</span><span class="stat-val">'+stats.oldest.name+'</span></div>':'')
      +'</div><div class="stat-card"><h4>关系统计</h4>'
      +'<div class="stat-row"><span>配偶关系</span><span class="stat-val">'+App.appState.relations.filter(function(r){return r.type==='spouse';}).length+'</span></div>'
      +'<div class="stat-row"><span>亲子关系</span><span class="stat-val">'+App.appState.relations.filter(function(r){return r.type==='parent-child';}).length+'</span></div>'
      +'</div>';
  }

  App.updateHistoryPanel = function() {
    // 渲染操作历史
    var historyContent = document.getElementById('history-content');
    if (historyContent) {
      var html = '';
      var items = App.history.past.slice(-30).reverse();
      if (!items.length) html = '<div style="color:var(--text-muted);font-size:12px;padding:8px">暂无操作</div>';
      else items.forEach(function(item,i){
        html += '<div class="hist-item'+(i===0?' current':'')+'">'+item.label+'</div>';
      });
      if (App.history.future.length) {
        App.history.future.slice().reverse().forEach(function(item){
          html += '<div class="hist-item future">'+item.label+'</div>';
        });
      }
      historyContent.innerHTML = html;
    }

    // 渲染已保存版本
    var versionsContent = document.getElementById('versions-content');
    if (versionsContent) {
      var html = '';
      var versions = App.getVersions();
      if (!versions.length) html = '<div style="color:var(--text-muted);font-size:12px;padding:8px">暂无保存版本</div>';
      else versions.forEach(function(v) {
        var d = new Date(v.timestamp);
        var timeStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
          +' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
        html += '<div class="version-item">'
          +'<div class="version-item-header"><span class="version-item-label">'+v.label+'</span></div>'
          +'<div class="version-item-time">'+timeStr+'</div>'
          +'<div class="version-item-btns">'
          +'<button class="version-btn" data-restore="'+v.id+'">恢复</button>'
          +'<button class="version-btn danger" data-delete="'+v.id+'">删除</button>'
          +'</div></div>';
      });
      versionsContent.innerHTML = html;

      // 绑定版本操作事件
      versionsContent.querySelectorAll('[data-restore]').forEach(function(btn){
        btn.addEventListener('click',function(){App.restoreVersion(btn.dataset.restore);});
      });
      versionsContent.querySelectorAll('[data-delete]').forEach(function(btn){
        btn.addEventListener('click',function(){if(confirm('确定删除此版本？'))App.deleteVersion(btn.dataset.delete);});
      });
    }

    // 绑定折叠事件
    document.querySelectorAll('.hist-collapsible-header').forEach(function(header){
      header.removeEventListener('click', handleCollapseToggle);
      header.addEventListener('click', handleCollapseToggle);
    });

    // 恢复折叠状态
    restoreCollapseState();
  };

  // 折叠事件处理
  function handleCollapseToggle(e) {
    var section = e.currentTarget.dataset.toggle;
    if (section) {
      var el = document.querySelector('[data-section="'+section+'"]');
      if (el) {
        el.classList.toggle('collapsed');
        saveCollapseState();
      }
    }
  }

  // 保存折叠状态
  function saveCollapseState() {
    var state = {};
    document.querySelectorAll('.hist-collapsible').forEach(function(el){
      state[el.dataset.section] = el.classList.contains('collapsed');
    });
    try {
      localStorage.setItem('jiapu-history-collapse', JSON.stringify(state));
    } catch(e) {}
  }

  // 恢复折叠状态
  function restoreCollapseState() {
    try {
      var saved = localStorage.getItem('jiapu-history-collapse');
      if (saved) {
        var state = JSON.parse(saved);
        Object.keys(state).forEach(function(section){
          var el = document.querySelector('[data-section="'+section+'"]');
          if (el && state[section]) el.classList.add('collapsed');
        });
      }
    } catch(e) {}
  }

  App.updateUndoRedoBtns = function() {
    document.getElementById('btn-undo').disabled = !App.history.canUndo();
    document.getElementById('btn-redo').disabled = !App.history.canRedo();
  };

  App.exportJSON = function() {
    var data = JSON.stringify({persons:App.appState.persons,relations:App.appState.relations,rootPersonId:App.appState.rootPersonId,generationNames:App.appState.generationNames||{},version:2},null,2);
    var blob = new Blob([data],{type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href=url; a.download='家谱_'+new Date().toISOString().slice(0,10)+'.json';
    a.click(); URL.revokeObjectURL(url);
    App.showToast('已导出 JSON');
  };

  App.exportPNG = function() {
    var collapsedSnapshot = Array.from(App.collapsedNodes || []);
    var expandedTemporarily = false;
    if (collapsedSnapshot.length) {
      App.collapsedNodes.clear();
      App.renderAll();
      expandedTemporarily = true;
    }

    try {
      if (!Object.keys(App.cachedPositions || {}).length) {
        App.showToast('暂无可导出的家谱内容');
        return;
      }

      var svg = document.getElementById('svg-canvas');
      if (!svg) {
        App.showToast('导出失败：画布不可用');
        return;
      }

      var bbox = App.computeBBox ? App.computeBBox(App.cachedPositions) : null;
      if (!bbox) {
        App.showToast('导出失败：无法计算范围');
        return;
      }

      // 导出整张家谱（非当前视口），默认使用矢量 SVG，避免字体发糊与内容被裁切
      var padding = 40;
      var contentW = Math.max(1, bbox.w + padding * 2);
      var contentH = Math.max(1, bbox.h + padding * 2);
      var viewMinX = bbox.minX - padding;
      var viewMinY = bbox.minY - padding;

      var clone = svg.cloneNode(true);
      clone.setAttribute('width', String(contentW));
      clone.setAttribute('height', String(contentH));
      clone.setAttribute('viewBox', viewMinX + ' ' + viewMinY + ' ' + contentW + ' ' + contentH);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      clone.style.background = '#f8fafc';

      // 清除当前视口缩放和平移，确保导出的是完整族谱而非屏幕视图
      var rootGroup = clone.querySelector('#svg-root');
      if (rootGroup) rootGroup.setAttribute('transform', '');

      var defs = clone.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        clone.insertBefore(defs, clone.firstChild);
      }
      var styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
      styleEl.textContent = 'text{ text-rendering: geometricPrecision; -webkit-font-smoothing: antialiased; }';
      defs.appendChild(styleEl);

      function triggerDownload(url, fileName) {
        var a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
      }

      var dateTag = new Date().toISOString().slice(0, 10);
      var serializer = new XMLSerializer();
      var svgStr = serializer.serializeToString(clone);
      var svgBlob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var svgUrl = URL.createObjectURL(svgBlob);
      triggerDownload(svgUrl, '家谱_' + dateTag + '.svg');
      setTimeout(function() { URL.revokeObjectURL(svgUrl); }, 0);

      // 额外导出一份超清 PNG，方便在不支持 SVG 的场景直接使用
      var exportScale = Math.max(4, Math.ceil((window.devicePixelRatio || 1) * 3));
      var maxSide = 30000;
      if (contentW * exportScale > maxSide || contentH * exportScale > maxSide) {
        exportScale = Math.floor(Math.min(maxSide / contentW, maxSide / contentH));
      }
      exportScale = Math.max(2, exportScale);

      var maxPixels = 120 * 1000 * 1000;
      var totalPixels = contentW * exportScale * contentH * exportScale;
      if (totalPixels > maxPixels) {
        exportScale = Math.max(2, Math.floor(Math.sqrt(maxPixels / (contentW * contentH))));
      }

      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(contentW * exportScale));
      canvas.height = Math.max(1, Math.floor(contentH * exportScale));
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        App.showToast('已导出 SVG，PNG 导出失败（画布不可用）');
        return;
      }
      ctx.setTransform(exportScale, 0, 0, exportScale, 0, 0);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, contentW, contentH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      var pngUrl = URL.createObjectURL(svgBlob);
      var img = new Image();
      img.onload = function() {
        ctx.drawImage(img, 0, 0, contentW, contentH);
        URL.revokeObjectURL(pngUrl);
        var outPngUrl = canvas.toDataURL('image/png');
        triggerDownload(outPngUrl, '家谱_' + dateTag + '_超清.png');
        App.showToast('已导出 SVG + 超清 PNG');
      };
      img.onerror = function() {
        URL.revokeObjectURL(pngUrl);
        App.showToast('已导出 SVG，PNG 导出失败');
      };
      img.src = pngUrl;
    } finally {
      if (expandedTemporarily) {
        App.collapsedNodes = new Set(collapsedSnapshot);
        App.renderAll();
      }
    }
  };

  App.importJSON = function(file) {
    // 如果已连接文件夹，提示用户导入会覆盖当前数据
    var isConnected = App.getConnectionStatus && App.getConnectionStatus() === 'connected';
    if (isConnected) {
      if (!confirm('导入JSON将覆盖当前家谱数据（导入后可使用撤销恢复）。\n注意：导入完成后会自动同步到已连接的文件夹。\n\n确定继续导入吗？')) return;
    }
    var reader = new FileReader();
    reader.onload = function(e){
      try {
        var data = JSON.parse(e.target.result);
        if (!data.persons) throw new Error('格式错误');
        App.history.execute(function(state){
          state.persons = data.persons||{};
          state.relations = data.relations||[];
          state.rootPersonId = data.rootPersonId||Object.keys(data.persons)[0]||null;
          state.generationNames = data.generationNames||{};
        }, '导入数据');
        setTimeout(App.fitToScreen, 100);
        App.showToast('导入成功，共 '+Object.keys(data.persons).length+' 人');
      } catch(err) { App.showToast('导入失败: '+err.message); }
    };
    reader.readAsText(file);
  };

  var searchOpen = false;
  var searchResults = [];
  var searchIndex = 0;

  App.toggleSearch = function() {
    if (searchOpen) { App.closeSearch(); return; }
    searchOpen = true;
    document.getElementById('search-bar').classList.add('open');
    document.getElementById('search-input').value = '';
    document.getElementById('search-count').textContent = '';
    searchResults = []; searchIndex = 0;
    App.searchHighlightIds = new Set(); App.searchCurrentId = null;
    setTimeout(function(){document.getElementById('search-input').focus();},50);
  };

  App.closeSearch = function() {
    searchOpen = false;
    document.getElementById('search-bar').classList.remove('open');
    App.searchHighlightIds = new Set(); App.searchCurrentId = null;
    if (Object.keys(App.cachedPositions).length) {
      var nodesEl = document.getElementById('svg-nodes');
      if (nodesEl) {
        var state = App.appState;
        var positions = App.cachedPositions;
        Object.values(state.persons).forEach(function(person) {
          var pos = positions[person.id]; if (!pos) return;
          var g = nodesEl.querySelector('[data-person-id="'+person.id+'"]');
          if (!g) return;
          var rect = g.querySelector('rect:nth-child(2)');
          if (!rect) return;
          var colors = (function(p){
            if (p.gender==='male') return {fill:'#dbeafe',stroke:'#3b82f6'};
            if (p.gender==='female') return {fill:'#fce7f3',stroke:'#ec4899'};
            return {fill:'#f3f4f6',stroke:'#9ca3af'};
          })(person);
          var isSelected = person.id === App.selectedPersonId;
          rect.setAttribute('stroke', isSelected?'#f59e0b':colors.stroke);
          rect.setAttribute('stroke-width', isSelected?3:1.5);
        });
      }
    }
  };

  function doSearch(query) {
    searchResults = []; searchIndex = 0;
    App.searchHighlightIds = new Set(); App.searchCurrentId = null;
    if (!query) {
      document.getElementById('search-count').textContent = '';
      App.renderAll();
      return;
    }
    var q = query.toLowerCase();
    Object.values(App.appState.persons).forEach(function(p) {
      if (p.name.toLowerCase().indexOf(q) !== -1 ||
          (p.birthPlace && p.birthPlace.toLowerCase().indexOf(q) !== -1) ||
          (p.notes && p.notes.toLowerCase().indexOf(q) !== -1)) {
        searchResults.push(p.id);
      }
    });
    if (searchResults.length) {
      searchResults.forEach(function(id){App.searchHighlightIds.add(id);});
      searchIndex = 0;
      App.searchCurrentId = searchResults[0];
      if (App.expandPathToPerson) App.expandPathToPerson(searchResults[0]);
      focusPerson(searchResults[0]);
    }
    document.getElementById('search-count').textContent = searchResults.length ? (searchIndex+1)+'/'+searchResults.length : '0';
    App.renderAll();
  }

  function searchNav(dir) {
    if (!searchResults.length) return;
    searchIndex = (searchIndex + dir + searchResults.length) % searchResults.length;
    App.searchCurrentId = searchResults[searchIndex];
    if (App.expandPathToPerson) App.expandPathToPerson(searchResults[searchIndex]);
    focusPerson(searchResults[searchIndex]);
    document.getElementById('search-count').textContent = (searchIndex+1)+'/'+searchResults.length;
    App.renderAll();
  }

  function initToolbar() {
    var moreWrap = document.getElementById('toolbar-more-wrap');
    var moreBtn = document.getElementById('btn-more');
    document.getElementById('btn-layout-td').addEventListener('click', function(){
      if (App.appState.layout==='top-down') return;
      App.history.execute(App.mutations.setLayout('top-down'),'切换纵向布局');
      document.getElementById('btn-layout-td').classList.add('active');
      document.getElementById('btn-layout-lr').classList.remove('active');
      setTimeout(App.fitToScreen, 50);
    });
    document.getElementById('btn-layout-lr').addEventListener('click', function(){
      if (App.appState.layout==='left-right') return;
      App.history.execute(App.mutations.setLayout('left-right'),'切换横向布局');
      document.getElementById('btn-layout-lr').classList.add('active');
      document.getElementById('btn-layout-td').classList.remove('active');
      setTimeout(App.fitToScreen, 50);
    });
    document.getElementById('btn-zoom-in').addEventListener('click',function(){App.vp.scale=Math.min(4,App.vp.scale*1.2);App.applyViewport();});
    document.getElementById('btn-zoom-out').addEventListener('click',function(){App.vp.scale=Math.max(0.1,App.vp.scale/1.2);App.applyViewport();});
    document.getElementById('btn-zoom-fit').addEventListener('click',function(){App.fitToScreen();});
    document.getElementById('btn-expand-all').addEventListener('click',function(){
      if (!App.expandAllNodes || !App.expandAllNodes()) {
        App.showToast('当前没有折叠分支');
      }
    });
    document.getElementById('btn-undo').addEventListener('click',function(){App.history.undo();});
    document.getElementById('btn-redo').addEventListener('click',function(){App.history.redo();});
    document.getElementById('btn-save').addEventListener('click',function(){App.openSavePopover();});
    document.getElementById('btn-export-json').addEventListener('click',function(){App.exportJSON();});
    document.getElementById('btn-export-png').addEventListener('click',function(){App.exportPNG();});
    document.getElementById('btn-import').addEventListener('click',function(){document.getElementById('import-file').click();});
    document.getElementById('import-file').addEventListener('change',function(e){
      if(e.target.files[0]){App.importJSON(e.target.files[0]);e.target.value='';}
    });
    document.getElementById('btn-clear').addEventListener('click',function(){
      if(!confirm('确定要清空所有数据吗？此操作可通过撤销恢复。')) return;
      App.history.execute(function(state){state.persons={};state.relations=[];state.rootPersonId=null;state.generationNames={};},'清空数据');
      App.showToast('已清空');
    });
    document.getElementById('btn-search').addEventListener('click',function(){App.toggleSearch();});
    document.getElementById('btn-shortcuts').addEventListener('click',function(){App.openShortcutsModal();});
    document.getElementById('btn-toggle-sidebar').addEventListener('click',function(){App.toggleSidebar();});
    document.getElementById('add-root-btn').addEventListener('click',function(){App.openPersonModal(null);});
    if (moreBtn && moreWrap) {
      moreBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        moreWrap.classList.toggle('open');
      });
      document.addEventListener('click', function(e) {
        if (!e.target.closest('#toolbar-more-wrap')) App.closeToolbarMoreMenu();
      });
      // 点击菜单内操作后自动收起，减少遮挡
      moreWrap.querySelectorAll('.toolbar-menu-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          App.closeToolbarMoreMenu();
        });
      });
    }
    document.getElementById('btn-layout-td').classList.toggle('active',App.appState.layout!=='left-right');
    document.getElementById('btn-layout-lr').classList.toggle('active',App.appState.layout==='left-right');
  }

  function initContextMenu() {
    document.getElementById('ctx-menu').addEventListener('click',function(e){
      var item = e.target.closest('.ctx-item');
      if (!item || !ctxPersonId) return;
      var action = item.dataset.action;
      var pid = ctxPersonId;
      App.closeContextMenu();
      if (action==='edit') { App.openPersonModal(pid); }
      else if (action==='delete') {
        var p = App.appState.persons[pid]; if (!p) return;
        if (!confirm('确定删除 "'+p.name+'"？相关关系也会一并删除。')) return;
        App.history.execute(App.mutations.deletePerson(pid),'删除 '+p.name);
        App.selectPerson(null); App.showToast('已删除 '+p.name);
      }
      else if (['add-spouse','add-child','add-parent','add-sibling'].indexOf(action)!==-1) {
        App.openPersonModal(null, {relatedId:pid, relationType:action});
      }
    });
    // 键盘快捷键支持
    document.getElementById('ctx-menu').addEventListener('keydown', function(e) {
      if (!ctxPersonId) return;
      var actionToShortcut = {
        'add-spouse': 'menuAddSpouse',
        'add-child': 'menuAddChild',
        'add-parent': 'menuAddParent',
        'add-sibling': 'menuAddSibling',
        'edit': 'menuEdit',
        'delete': 'menuDelete'
      };
      var item = null;
      Object.keys(actionToShortcut).some(function(action) {
        if (App.matchesShortcutEvent && App.matchesShortcutEvent(e, actionToShortcut[action])) {
          item = document.querySelector('#ctx-menu [data-action="' + action + '"]');
          return true;
        }
        return false;
      });
      if (item) {
        e.preventDefault();
        var action = item.dataset.action;
        var pid = ctxPersonId;
        App.closeContextMenu();
        if (action==='edit') { App.openPersonModal(pid); }
        else if (action==='delete') {
          var p = App.appState.persons[pid]; if (!p) return;
          if (!confirm('确定删除 "'+p.name+'"？相关关系也会一并删除。')) return;
          App.history.execute(App.mutations.deletePerson(pid),'删除 '+p.name);
          App.selectPerson(null); App.showToast('已删除 '+p.name);
        }
        else if (['add-spouse','add-child','add-parent','add-sibling'].indexOf(action)!==-1) {
          App.openPersonModal(null, {relatedId:pid, relationType:action});
        }
      }
    });
    document.addEventListener('click',function(e){
      if (!e.target.closest('#ctx-menu')) App.closeContextMenu();
    });
  }

  function initRelationMenu() {
    document.getElementById('relation-menu').addEventListener('click',function(e){
      var item = e.target.closest('.ctx-item');
      if (!item || !relationMenuFromId || !relationMenuToId) return;
      var relation = item.dataset.relation;
      // 先保存变量，再关闭菜单
      var fromId = relationMenuFromId;
      var toId = relationMenuToId;
      App.closeRelationMenu();
      App.createRelationBetween(fromId, toId, relation);
    });
    // 键盘快捷键支持
    document.getElementById('relation-menu').addEventListener('keydown', function(e) {
      if (!relationMenuFromId || !relationMenuToId) return;
      var relationToShortcut = {
        spouse: 'relSetSpouse',
        parent: 'relSetParent',
        child: 'relSetChild',
        sibling: 'relSetSibling'
      };
      var item = null;
      Object.keys(relationToShortcut).some(function(relation) {
        if (App.matchesShortcutEvent && App.matchesShortcutEvent(e, relationToShortcut[relation])) {
          item = document.querySelector('#relation-menu [data-relation="' + relation + '"]');
          return true;
        }
        return false;
      });
      if (item) {
        e.preventDefault();
        var relation = item.dataset.relation;
        var fromId = relationMenuFromId;
        var toId = relationMenuToId;
        App.closeRelationMenu();
        App.createRelationBetween(fromId, toId, relation);
      }
    });
    document.addEventListener('click',function(e){
      if (!e.target.closest('#relation-menu')) App.closeRelationMenu();
    });
  }

  function initModal() {
    document.getElementById('modal-close-btn').addEventListener('click',function(){App.closePersonModal();});
    document.getElementById('modal-cancel-btn').addEventListener('click',function(){App.closePersonModal();});
    document.getElementById('modal-save-btn').addEventListener('click',function(){savePersonModal();});
    document.getElementById('modal-delete-btn').addEventListener('click',function(){
      if (!modalPersonId) return;
      var p = App.appState.persons[modalPersonId]; if (!p) return;
      if (!confirm('确定删除 "'+p.name+'"？')) return;
      App.closePersonModal();
      App.history.execute(App.mutations.deletePerson(modalPersonId),'删除 '+p.name);
      App.selectPerson(null); App.showToast('已删除 '+p.name);
    });
    document.getElementById('modal-overlay').addEventListener('click',function(e){
      if (e.target===document.getElementById('modal-overlay')) App.closePersonModal();
    });
    document.getElementById('f-photo').addEventListener('change',function(e){
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        var preview = document.getElementById('photo-preview');
        preview.src=ev.target.result; preview.style.display='block';
        updatePhotoRemoveBtn();
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('f-photo-remove').addEventListener('click', function() {
      var preview = document.getElementById('photo-preview');
      preview.src = '';
      preview.style.display = 'none';
      document.getElementById('f-photo').value = '';
      updatePhotoRemoveBtn();
    });
    document.getElementById('photo-preview').addEventListener('click', function(e) {
      if (!e.currentTarget.src) return;
      App.openPhotoViewer(e.currentTarget.src, document.getElementById('f-name').value || '人物');
    });
    document.getElementById('f-name').addEventListener('keydown',function(e){
      if (e.key==='Enter') savePersonModal();
    });
  }

  function initEdgePopover() {
    document.getElementById('edge-save-btn').addEventListener('click',function(){saveEdgeNote();});
    document.getElementById('edge-cancel-btn').addEventListener('click',function(){App.closeEdgePopover();});
    document.getElementById('edge-delete-btn').addEventListener('click',function(){deleteEdgeRelation();});
    document.getElementById('edge-note-input').addEventListener('keydown',function(e){
      if (e.key==='Enter') saveEdgeNote();
      if (e.key==='Escape') App.closeEdgePopover();
    });
    document.addEventListener('click',function(e){
      if (!e.target.closest('#edge-popover')&&!e.target.closest('[data-rel-id]')) App.closeEdgePopover();
    });
  }

  function deleteEdgeRelation() {
    if (!edgePopoverRelId) return;
    var rel = App.appState.relations.find(function(r){return r.id===edgePopoverRelId;});
    if (!rel) return;

    var typeLabel = {'spouse':'配偶','parent-child':'亲子','sibling':'兄弟姐妹'}[rel.type] || rel.type;
    var fromName = App.appState.persons[rel.fromId] ? App.appState.persons[rel.fromId].name : '?';
    var toName = App.appState.persons[rel.toId] ? App.appState.persons[rel.toId].name : '?';

    if (!confirm('确定要删除这条'+typeLabel+'关系吗？\n\n'+fromName+' ↔ '+toName)) return;

    App.history.execute(App.mutations.deleteRelation(edgePopoverRelId), '删除'+typeLabel+'关系');
    App.closeEdgePopover();
    App.showToast('关系已删除');
  }

  function initSavePopover() {
    document.getElementById('save-confirm-btn').addEventListener('click',function(){confirmSave();});
    document.getElementById('save-cancel-btn').addEventListener('click',function(){App.closeSavePopover();});
    document.getElementById('save-label-input').addEventListener('keydown',function(e){
      if (e.key==='Enter') confirmSave();
      if (e.key==='Escape') App.closeSavePopover();
    });
    document.addEventListener('click',function(e){
      if (!e.target.closest('#save-popover')&&!e.target.closest('#btn-save')) App.closeSavePopover();
    });
  }

  function initSidebarTabs() {
    document.querySelectorAll('.stab').forEach(function(tab){
      tab.addEventListener('click',function(){
        activeSidebarTab = tab.dataset.tab;
        document.querySelectorAll('.stab').forEach(function(t){t.classList.remove('active');});
        tab.classList.add('active');
        document.getElementById('tab-generations').style.display = activeSidebarTab==='generations'?'':'none';
        document.getElementById('tab-stats').style.display = activeSidebarTab==='stats'?'':'none';
        document.getElementById('tab-history').style.display = activeSidebarTab==='history'?'':'none';
        if (activeSidebarTab==='history') App.updateHistoryPanel();
        if (activeSidebarTab==='stats') updateStatsTab();
      });
    });
  }

  function initSearch() {
    document.getElementById('search-input').addEventListener('input',function(e){
      doSearch(e.target.value.trim());
    });
    document.getElementById('search-input').addEventListener('keydown',function(e){
      if (e.key==='Enter') { e.preventDefault(); searchNav(e.shiftKey?-1:1); }
      if (e.key==='Escape') App.closeSearch();
    });
    document.getElementById('search-prev').addEventListener('click',function(){searchNav(-1);});
    document.getElementById('search-next').addEventListener('click',function(){searchNav(1);});
    document.getElementById('search-close').addEventListener('click',function(){App.closeSearch();});
  }

  function initShortcutsModal() {
    document.getElementById('shortcuts-overlay').addEventListener('click',function(e){
      if (e.target===document.getElementById('shortcuts-overlay')) App.closeShortcutsModal();
    });
  }

  function initPhotoViewer() {
    var overlay = document.getElementById('photo-viewer-overlay');
    var closeBtn = document.getElementById('photo-viewer-close');
    if (!overlay || !closeBtn) return;

    closeBtn.addEventListener('click', function() {
      App.closePhotoViewer();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) App.closePhotoViewer();
    });
  }

  var autoSaveInterval = null;
  var lastAutoSaveTime = 0;
  var autoSaveIntervalMs = 60000; // 默认 60 秒

  // 设置保存到内存中
  var appSettings = {
    autoSaveInterval: 60
  };

  function loadSettings() {
    // 如果文件系统已加载了设置（App._settings），优先使用
    var src = App._settings || appSettings;
    if (src && src.autoSaveInterval) {
      autoSaveIntervalMs = src.autoSaveInterval * 1000;
      if (autoSaveIntervalMs < 10000) autoSaveIntervalMs = 10000;
      if (autoSaveIntervalMs > 600000) autoSaveIntervalMs = 600000;
    }
  }

  // 供文件系统模块在加载设置后调用，动态应用设置
  App._applySettings = function(settings) {
    if (!settings) return;
    if (settings.autoSaveInterval) {
      autoSaveIntervalMs = settings.autoSaveInterval * 1000;
      if (autoSaveIntervalMs < 10000) autoSaveIntervalMs = 10000;
      if (autoSaveIntervalMs > 600000) autoSaveIntervalMs = 600000;
      initAutoSave(); // 重启自动保存定时器
    }
  };

  function saveSettings() {
    // 保存设置到文件系统
    appSettings.autoSaveInterval = Math.round(autoSaveIntervalMs / 1000);
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.persistSettingsToFileSystem && App.persistSettingsToFileSystem(appSettings);
    }
  }

  function initAutoSave() {
    if (autoSaveInterval) clearInterval(autoSaveInterval);
    autoSaveInterval = setInterval(function() {
      if (!App.getConnectionStatus || App.getConnectionStatus() !== 'connected') return;
      var now = Date.now();
      if (now - lastAutoSaveTime > autoSaveIntervalMs - 2000) {
        App.persist();
        lastAutoSaveTime = now;
        showAutoSaveIndicator();
      }
    }, Math.min(autoSaveIntervalMs, 10000));
  }

  function showAutoSaveIndicator() {
    var indicator = document.getElementById('auto-save-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'auto-save-indicator';
      indicator.className = 'auto-save-indicator';
      indicator.textContent = '已自动保存';
      document.body.appendChild(indicator);
    }
    indicator.classList.add('show');
    setTimeout(function() {
      indicator.classList.remove('show');
    }, 2000);
  }

  App.openSettingsModal = function() {
    var overlay = document.getElementById('settings-overlay');
    var input = document.getElementById('autosave-interval');
    input.value = Math.round(autoSaveIntervalMs / 1000);
    overlay.classList.add('open');
  };

  App.closeSettingsModal = function() {
    document.getElementById('settings-overlay').classList.remove('open');
  };

  function initSettingsModal() {
    document.getElementById('btn-settings').addEventListener('click', function(){App.openSettingsModal();});
    document.getElementById('settings-close-btn').addEventListener('click', function(){App.closeSettingsModal();});
    document.getElementById('settings-cancel-btn').addEventListener('click', function(){App.closeSettingsModal();});
    document.getElementById('settings-save-btn').addEventListener('click', function(){
      var val = parseInt(document.getElementById('autosave-interval').value, 10);
      if (isNaN(val) || val < 10) val = 10;
      if (val > 600) val = 600;
      autoSaveIntervalMs = val * 1000;
      saveSettings();
      initAutoSave();
      App.closeSettingsModal();
      App.showToast('设置已保存，自动保存间隔: ' + val + '秒');
    });
    document.getElementById('settings-overlay').addEventListener('click', function(e){
      if (e.target === document.getElementById('settings-overlay')) App.closeSettingsModal();
    });
  }

  // ========== 文件系统连接 UI ==========
  App.updateConnectionUI = function(status) {
    var indicator = document.getElementById('fs-status-indicator');
    var statusText = document.getElementById('fs-status-text');
    var connectBtn = document.getElementById('btn-connect-folder');
    var disconnectBtn = document.getElementById('btn-disconnect-folder');

    if (!indicator || !statusText) return;

    switch (status) {
      case 'connected':
        indicator.className = 'fs-indicator connected';
        statusText.textContent = '已连接';
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'inline-flex';
        break;
      case 'connecting':
        indicator.className = 'fs-indicator connecting';
        statusText.textContent = '连接中...';
        break;
      case 'unsupported':
        indicator.className = 'fs-indicator unsupported';
        statusText.textContent = '不支持';
        if (connectBtn) connectBtn.style.display = 'none';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        break;
      case 'error':
        indicator.className = 'fs-indicator error';
        statusText.textContent = '连接错误';
        if (connectBtn) connectBtn.style.display = 'inline-flex';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
        break;
      default:
        indicator.className = 'fs-indicator disconnected';
        statusText.textContent = '未连接';
        if (connectBtn) connectBtn.style.display = 'inline-flex';
        if (disconnectBtn) disconnectBtn.style.display = 'none';
    }
  };

  // 更新文件夹名称显示
  App.updateFolderInfo = function(folderName) {
    var folderNameEl = document.getElementById('fs-folder-name');
    if (folderNameEl) {
      if (folderName) {
        folderNameEl.textContent = '📁 ' + folderName + ' → data/';
        folderNameEl.style.display = 'inline';
        folderNameEl.title = '数据文件保存在此文件夹的 data 子目录中';
      } else {
        folderNameEl.style.display = 'none';
      }
    }
  };

  function initFileSystemUI() {
    // 连接文件夹按钮
    var connectBtn = document.getElementById('btn-connect-folder');
    if (connectBtn) {
      connectBtn.addEventListener('click', function() {
        App.requestDirectoryAccess().catch(function(err) {
          console.error('连接失败', err);
        });
      });
    }

    // 断开连接按钮
    var disconnectBtn = document.getElementById('btn-disconnect-folder');
    if (disconnectBtn) {
      disconnectBtn.addEventListener('click', function() {
        if (confirm('确定要断开本地文件夹连接吗？')) {
          App.disconnectFileSystem();
        }
      });
    }

    // 点击状态区域也可以连接
    var fsStatus = document.getElementById('fs-status');
    if (fsStatus) {
      fsStatus.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') return;
        var currentStatus = App.getConnectionStatus ? App.getConnectionStatus() : 'disconnected';
        if (currentStatus === 'disconnected' || currentStatus === 'remembered' || currentStatus === 'error') {
          App.requestDirectoryAccess().catch(function(err) {
            console.error('连接失败', err);
          });
        } else if (currentStatus === 'connected') {
          var info = App.getDirectoryInfo ? App.getDirectoryInfo() : null;
          if (info) {
            App.showToast('已连接: ' + info.name + ' (最后同步: ' + info.lastSync + ')');
          }
        }
      });
      fsStatus.style.cursor = 'pointer';
    }

    // 欢迎弹窗的连接按钮
    var welcomeConnectBtn = document.getElementById('welcome-connect-btn');
    if (welcomeConnectBtn) {
      welcomeConnectBtn.addEventListener('click', function() {
        App.requestDirectoryAccess().catch(function(err) {
          console.error('连接失败', err);
        });
      });
    }

    // 欢迎弹窗的"暂不连接"按钮
    var welcomeSkipBtn = document.getElementById('welcome-skip-btn');
    if (welcomeSkipBtn) {
      welcomeSkipBtn.addEventListener('click', function() {
        App.closeWelcomeModal();
      });
    }
  }

  // ========== 欢迎弹窗相关 ==========
  App.showWelcomeModal = function() {
    var overlay = document.getElementById('welcome-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
    }
  };

  App.closeWelcomeModal = function() {
    var overlay = document.getElementById('welcome-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  };

  App.showBrowserUnsupported = function() {
    var overlay = document.getElementById('unsupported-overlay');
    var welcomeOverlay = document.getElementById('welcome-overlay');
    if (welcomeOverlay) welcomeOverlay.style.display = 'none';
    if (overlay) overlay.style.display = 'flex';
  };

  App.init = function() {
    loadSettings();

    // 初始化文件系统模块
    App.initFileSystem().then(function() {
      App.initViewport();
      initToolbar();
      initContextMenu();
      initRelationMenu();
      initModal();
      initEdgePopover();
      initSavePopover();
      initSidebarTabs();
      initSearch();
      initShortcutsModal();
      initPhotoViewer();
      initSettingsModal();
      initFileSystemUI();
      App.initKeyboard();
      initAutoSave();

      var svg = document.getElementById('svg-canvas');
      App.vp.x = (svg.clientWidth||800)/2;
      App.vp.y = (svg.clientHeight||600)/3;

      // 检查是否需要显示欢迎弹窗
      if (App.shouldShowWelcome && App.shouldShowWelcome()) {
        App.showWelcomeModal();
      }

      App.renderAll();
      App.updateUndoRedoBtns();
      App.updateHistoryPanel();
      restoreSidebarState();

    }).catch(function(err) {
      console.error('初始化失败', err);
      App.initViewport();
      initToolbar();
      initContextMenu();
      initRelationMenu();
      initModal();
      initEdgePopover();
      initSavePopover();
      initSidebarTabs();
      initSearch();
      initShortcutsModal();
      initPhotoViewer();
      initSettingsModal();
      initFileSystemUI();
      App.initKeyboard();
      initAutoSave();

      var svg = document.getElementById('svg-canvas');
      App.vp.x = (svg.clientWidth||800)/2;
      App.vp.y = (svg.clientHeight||600)/3;

      App.renderAll();
      App.updateUndoRedoBtns();
      App.updateHistoryPanel();
    });
  };

  document.addEventListener('DOMContentLoaded', App.init);

})(window.App = window.App || {});
