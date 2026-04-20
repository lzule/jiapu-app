(function(App) {
  var BASE_LAYOUT = {
    nodeW: 140,
    nodeH: 60,
    baseHGap: 54,
    baseVGap: 100,
    coupleGap: 24,
    subtreePadding: 20,
    minReadableGap: 24
  };

  App.NODE_W = BASE_LAYOUT.nodeW;
  App.NODE_H = BASE_LAYOUT.nodeH;
  App.H_GAP = BASE_LAYOUT.baseHGap;
  App.V_GAP = BASE_LAYOUT.baseVGap;
  App.COUPLE_GAP = BASE_LAYOUT.coupleGap;

  function toArraySetMap(mapObj) {
    var out = {};
    Object.keys(mapObj).forEach(function(k) {
      out[k] = Array.from(mapObj[k]);
    });
    return out;
  }

  function sortIds(ids) {
    return ids.slice().sort(function(a, b) { return a.localeCompare(b); });
  }

  function getParentKey(parentIds) {
    if (!parentIds || !parentIds.length) return '';
    return sortIds(parentIds).join('|');
  }

  App.buildRelationIndex = function(state) {
    state = state || App.appState;
    var parentIdsByChildSet = {};
    var childIdsByParentSet = {};
    var spousesByPersonSet = {};
    var parentChildRelsByChild = {};
    var spousePairs = [];
    var persons = state.persons || {};

    Object.keys(persons).forEach(function(id) {
      parentIdsByChildSet[id] = new Set();
      childIdsByParentSet[id] = new Set();
      spousesByPersonSet[id] = new Set();
      parentChildRelsByChild[id] = [];
    });

    (state.relations || []).forEach(function(rel) {
      if (rel.type === 'parent-child') {
        if (!parentIdsByChildSet[rel.toId]) parentIdsByChildSet[rel.toId] = new Set();
        if (!childIdsByParentSet[rel.fromId]) childIdsByParentSet[rel.fromId] = new Set();
        if (!parentChildRelsByChild[rel.toId]) parentChildRelsByChild[rel.toId] = [];
        parentIdsByChildSet[rel.toId].add(rel.fromId);
        childIdsByParentSet[rel.fromId].add(rel.toId);
        parentChildRelsByChild[rel.toId].push(rel);
      } else if (rel.type === 'spouse') {
        if (!spousesByPersonSet[rel.fromId]) spousesByPersonSet[rel.fromId] = new Set();
        if (!spousesByPersonSet[rel.toId]) spousesByPersonSet[rel.toId] = new Set();
        spousesByPersonSet[rel.fromId].add(rel.toId);
        spousesByPersonSet[rel.toId].add(rel.fromId);
        spousePairs.push(sortIds([rel.fromId, rel.toId]));
      }
    });

    var parentIdsByChild = toArraySetMap(parentIdsByChildSet);
    var childIdsByParent = toArraySetMap(childIdsByParentSet);
    var spousesByPerson = toArraySetMap(spousesByPersonSet);

    var childOrderHint = {};
    Object.keys(persons).forEach(function(childId) {
      var rels = parentChildRelsByChild[childId] || [];
      var hint = Infinity;
      rels.forEach(function(rel) {
        var ord = (typeof rel.order === 'number') ? rel.order : 0;
        if (ord < hint) hint = ord;
      });
      childOrderHint[childId] = hint === Infinity ? 0 : hint;
    });

    return {
      parentIdsByChild: parentIdsByChild,
      childIdsByParent: childIdsByParent,
      spousesByPerson: spousesByPerson,
      childOrderHint: childOrderHint,
      spousePairs: spousePairs
    };
  };

  App.computeGenerations = function(state) {
    state = state || App.appState;
    var persons = state.persons || {};
    if (!Object.keys(persons).length) return {};

    var rootId = state.rootPersonId || Object.keys(persons)[0];
    if (!rootId) return {};

    var genMap = {};
    var queue = [{ id: rootId, gen: 0 }];
    var visited = new Set();

    while (queue.length) {
      var item = queue.shift();
      var id = item.id;
      var gen = item.gen;
      if (!persons[id] || visited.has(id)) continue;
      visited.add(id);
      genMap[id] = gen;

      App.getSpouses(id, state).forEach(function(sp) {
        if (!visited.has(sp.id)) queue.push({ id: sp.id, gen: gen });
      });
      App.getChildren(id, state).forEach(function(ch) {
        if (!visited.has(ch.id)) queue.push({ id: ch.id, gen: gen + 1 });
      });
      App.getParents(id, state).forEach(function(pa) {
        if (!visited.has(pa.id)) queue.push({ id: pa.id, gen: gen - 1 });
      });
      (state.relations || []).forEach(function(rel) {
        if (rel.type !== 'sibling') return;
        if (rel.fromId !== id && rel.toId !== id) return;
        var sibId = rel.fromId === id ? rel.toId : rel.fromId;
        if (!visited.has(sibId)) queue.push({ id: sibId, gen: gen });
      });
    }

    Object.keys(persons).forEach(function(id) {
      if (!(id in genMap)) genMap[id] = 0;
    });

    var vals = Object.values(genMap);
    if (!vals.length) return genMap;
    var minGen = Math.min.apply(null, vals);
    if (minGen !== 0) {
      Object.keys(genMap).forEach(function(id) { genMap[id] -= minGen; });
    }
    return genMap;
  };

  App.groupByGeneration = function(genMap) {
    var groups = {};
    Object.entries(genMap).forEach(function(entry) {
      var id = entry[0];
      var gen = entry[1];
      if (!groups[gen]) groups[gen] = [];
      groups[gen].push(id);
    });
    return groups;
  };

  function makeLayoutParams(state, genGroups, units) {
    var genCounts = Object.values(genGroups).map(function(ids) { return ids.length; });
    var maxGenCount = genCounts.length ? Math.max.apply(null, genCounts) : 1;
    var maxChildren = units.length
      ? units.reduce(function(m, u) { return Math.max(m, (u.children || []).length); }, 0)
      : 0;

    var densityBoost = Math.min(120, Math.max(0, maxGenCount - 8) * 4);
    var familyBoost = Math.min(110, Math.max(0, maxChildren - 3) * 9);

    return {
      nodeW: BASE_LAYOUT.nodeW,
      nodeH: BASE_LAYOUT.nodeH,
      coupleGap: BASE_LAYOUT.coupleGap,
      hGap: BASE_LAYOUT.baseHGap + densityBoost + Math.floor(familyBoost * 0.5),
      vGap: BASE_LAYOUT.baseVGap + Math.floor(familyBoost * 0.45) + Math.floor(densityBoost * 0.3),
      subtreePadding: BASE_LAYOUT.subtreePadding + Math.floor(familyBoost * 0.2),
      minReadableGap: BASE_LAYOUT.minReadableGap
    };
  }

  App.detectFamilyUnits = function(state) {
    state = state || App.appState;
    var persons = state.persons || {};
    var idx = App.buildRelationIndex(state);
    var unitsByKey = {};
    var personInUnitAsParent = {};

    function ensureUnit(parentIds) {
      var sortedParents = sortIds(parentIds || []).slice(0, 2);
      var key = 'p:' + getParentKey(sortedParents);
      if (!unitsByKey[key]) {
        unitsByKey[key] = {
          id: key,
          parentIds: sortedParents,
          parentA: sortedParents[0] || null,
          parentB: sortedParents[1] || null,
          children: []
        };
      }
      return unitsByKey[key];
    }

    Object.keys(persons).forEach(function(childId) {
      var parentIds = sortIds(idx.parentIdsByChild[childId] || []).slice(0, 2);
      if (!parentIds.length) return;
      var unit = ensureUnit(parentIds);
      unit.children.push(childId);
      parentIds.forEach(function(pid) { personInUnitAsParent[pid] = true; });
    });

    idx.spousePairs.forEach(function(pair) {
      var key = 'p:' + getParentKey(pair);
      if (!unitsByKey[key]) {
        unitsByKey[key] = {
          id: key,
          parentIds: pair.slice(0, 2),
          parentA: pair[0] || null,
          parentB: pair[1] || null,
          children: []
        };
      }
      pair.forEach(function(pid) { personInUnitAsParent[pid] = true; });
    });

    Object.keys(persons).forEach(function(pid) {
      if (personInUnitAsParent[pid]) return;
      var key = 'solo:' + pid;
      unitsByKey[key] = {
        id: key,
        parentIds: [pid],
        parentA: pid,
        parentB: null,
        children: []
      };
    });

    return Object.values(unitsByKey);
  };

  function getUnitOrderHint(unit, state, idx) {
    var hint = Infinity;
    (unit.parentIds || []).forEach(function(pid) {
      (idx.parentIdsByChild[pid] || []).forEach(function(ppid) {
        (state.relations || []).forEach(function(rel) {
          if (rel.type === 'parent-child' && rel.fromId === ppid && rel.toId === pid) {
            var ord = (typeof rel.order === 'number') ? rel.order : 0;
            if (ord < hint) hint = ord;
          }
        });
      });
    });
    if (hint === Infinity) return 0;
    return hint;
  }

  App.computeLayout = function(state) {
    state = state || App.appState;
    var persons = state.persons || {};
    if (!Object.keys(persons).length) return {};

    var genMap = App.computeGenerations(state);
    var genGroups = App.groupByGeneration(genMap);
    var idx = App.buildRelationIndex(state);
    var units = App.detectFamilyUnits(state);
    var params = makeLayoutParams(state, genGroups, units);

    App.NODE_W = params.nodeW;
    App.NODE_H = params.nodeH;
    App.H_GAP = params.hGap;
    App.V_GAP = params.vGap;
    App.COUPLE_GAP = params.coupleGap;

    var unitsById = {};
    var unitIdsByParent = {};
    units.forEach(function(unit) {
      unitsById[unit.id] = unit;
      unit.parentIds.forEach(function(pid) {
        if (!unitIdsByParent[pid]) unitIdsByParent[pid] = [];
        unitIdsByParent[pid].push(unit.id);
      });
    });

    // 复杂关系里同一人可能属于多个家庭单元，这里选一个主单元用于递归排版
    var primaryUnitIdByParent = {};
    Object.keys(unitIdsByParent).forEach(function(pid) {
      var ids = unitIdsByParent[pid].slice();
      ids.sort(function(a, b) {
        var ua = unitsById[a];
        var ub = unitsById[b];
        var childDelta = (ub.children.length || 0) - (ua.children.length || 0);
        if (childDelta !== 0) return childDelta;
        var spouseDelta = (ub.parentB ? 1 : 0) - (ua.parentB ? 1 : 0);
        if (spouseDelta !== 0) return spouseDelta;
        return ua.id.localeCompare(ub.id);
      });
      primaryUnitIdByParent[pid] = ids[0];
    });

    function getPrimaryUnitIdForPerson(pid) {
      return primaryUnitIdByParent[pid] || ('solo:' + pid);
    }

    function sortedChildrenOfUnit(unit) {
      var children = (unit.children || []).slice();
      children.sort(function(a, b) {
        var oa = idx.childOrderHint[a] || 0;
        var ob = idx.childOrderHint[b] || 0;
        if (oa !== ob) return oa - ob;
        var na = (persons[a] && persons[a].name) ? persons[a].name : a;
        var nb = (persons[b] && persons[b].name) ? persons[b].name : b;
        return na.localeCompare(nb);
      });
      return children;
    }

    var widthMemo = {};
    var widthVisiting = {};

    function getParentSpan(unit) {
      if (unit.parentB) return params.nodeW * 2 + params.coupleGap;
      return params.nodeW;
    }

    function calcUnitWidth(unitId) {
      if (!unitsById[unitId]) return params.nodeW + params.subtreePadding * 2;
      if (widthMemo[unitId] !== undefined) return widthMemo[unitId];
      if (widthVisiting[unitId]) {
        widthMemo[unitId] = params.nodeW + params.subtreePadding * 2;
        return widthMemo[unitId];
      }
      widthVisiting[unitId] = true;

      var unit = unitsById[unitId];
      var parentSpan = getParentSpan(unit);
      var children = sortedChildrenOfUnit(unit);

      if (!children.length) {
        widthMemo[unitId] = parentSpan + params.subtreePadding * 2;
        widthVisiting[unitId] = false;
        return widthMemo[unitId];
      }

      var childWidths = children.map(function(cid) {
        return calcUnitWidth(getPrimaryUnitIdForPerson(cid));
      });
      var siblingsGap = Math.max(params.hGap, params.minReadableGap);
      var childrenSpan = childWidths.reduce(function(sum, w) { return sum + w; }, 0)
        + (children.length - 1) * siblingsGap;

      widthMemo[unitId] = Math.max(parentSpan, childrenSpan) + params.subtreePadding * 2;
      widthVisiting[unitId] = false;
      return widthMemo[unitId];
    }

    Object.keys(unitsById).forEach(calcUnitWidth);

    var positions = {};
    var laidOutUnit = {};

    function placeUnitParents(unit, centerX, y) {
      if (unit.parentB) {
        positions[unit.parentA] = { x: centerX - (params.nodeW / 2 + params.coupleGap / 2), y: y };
        positions[unit.parentB] = { x: centerX + (params.nodeW / 2 + params.coupleGap / 2), y: y };
      } else if (unit.parentA) {
        positions[unit.parentA] = { x: centerX, y: y };
      }
    }

    function layoutUnit(unitId, leftX, gen, routeStack) {
      if (!unitsById[unitId]) return;
      if (laidOutUnit[unitId]) return;
      routeStack = routeStack || {};
      if (routeStack[unitId]) return;
      routeStack[unitId] = true;

      var unit = unitsById[unitId];
      var width = calcUnitWidth(unitId);
      var centerX = leftX + width / 2;
      var y = gen * (params.nodeH + params.vGap);
      placeUnitParents(unit, centerX, y);
      laidOutUnit[unitId] = true;

      var children = sortedChildrenOfUnit(unit);
      if (!children.length) {
        routeStack[unitId] = false;
        return;
      }

      var childWidths = children.map(function(cid) {
        return calcUnitWidth(getPrimaryUnitIdForPerson(cid));
      });
      var siblingsGap = Math.max(params.hGap, params.minReadableGap);
      var childrenSpan = childWidths.reduce(function(sum, w) { return sum + w; }, 0)
        + (children.length - 1) * siblingsGap;

      var childLeft = centerX - childrenSpan / 2;
      children.forEach(function(cid, index) {
        var cUnitId = getPrimaryUnitIdForPerson(cid);
        layoutUnit(cUnitId, childLeft, gen + 1, routeStack);
        childLeft += childWidths[index] + siblingsGap;
      });
      routeStack[unitId] = false;
    }

    var unitGen = {};
    Object.values(unitsById).forEach(function(unit) {
      var g = 0;
      if (unit.parentA && genMap[unit.parentA] !== undefined) g = genMap[unit.parentA];
      else if (unit.parentB && genMap[unit.parentB] !== undefined) g = genMap[unit.parentB];
      unitGen[unit.id] = g;
    });

    var minGen = Math.min.apply(null, Object.values(genMap));
    if (!isFinite(minGen)) minGen = 0;
    var topUnits = Object.values(unitsById).filter(function(unit) {
      return unitGen[unit.id] === minGen;
    });
    if (!topUnits.length) topUnits = Object.values(unitsById);

    topUnits.sort(function(a, b) {
      var ga = getUnitOrderHint(a, state, idx);
      var gb = getUnitOrderHint(b, state, idx);
      if (ga !== gb) return ga - gb;
      return a.id.localeCompare(b.id);
    });

    var topGap = Math.max(params.hGap, params.minReadableGap);
    var totalTopWidth = topUnits.reduce(function(sum, unit, i) {
      return sum + calcUnitWidth(unit.id) + (i ? topGap : 0);
    }, 0);
    var startX = -totalTopWidth / 2;

    topUnits.forEach(function(unit) {
      layoutUnit(unit.id, startX, minGen, {});
      startX += calcUnitWidth(unit.id) + topGap;
    });

    // 回填未布局节点（例如异常关系图）
    Object.keys(persons).forEach(function(pid) {
      if (positions[pid]) return;
      positions[pid] = {
        x: 0,
        y: (genMap[pid] || 0) * (params.nodeH + params.vGap)
      };
    });

    if (state.layout === 'left-right') {
      var swapped = {};
      Object.keys(positions).forEach(function(pid) {
        swapped[pid] = { x: positions[pid].y, y: positions[pid].x };
      });
      return swapped;
    }

    return positions;
  };

  App.computeBBox = function(positions) {
    var posVals = Object.values(positions || {});
    if (!posVals.length) return { minX: 0, minY: 0, maxX: 800, maxY: 600, w: 800, h: 600 };

    var xs = posVals.map(function(p) { return p.x; });
    var ys = posVals.map(function(p) { return p.y; });
    var minX = Math.min.apply(null, xs) - App.NODE_W / 2 - 40;
    var minY = Math.min.apply(null, ys) - App.NODE_H / 2 - 40;
    var maxX = Math.max.apply(null, xs) + App.NODE_W / 2 + 40;
    var maxY = Math.max.apply(null, ys) + App.NODE_H / 2 + 40;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY };
  };
})(window.App = window.App || {});

