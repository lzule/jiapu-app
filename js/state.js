(function(App) {
  App.uuid = function() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  };

  App.deepClone = function(obj) {
    return JSON.parse(JSON.stringify(obj));
  };

  App.STORAGE_KEY = 'jiapu_v1';
  App.VERSIONS_KEY = 'jiapu_versions_v1';
  App.SHORTCUTS_KEY = 'jiapu_shortcuts_v1';

  App.DEFAULT_STATE = {
    persons: {},
    relations: [],
    rootPersonId: null,
    layout: 'top-down',
    viewport: { x: 0, y: 0, scale: 1 },
    generationNames: {},
    version: 2
  };

  App.appState = App.deepClone(App.DEFAULT_STATE);

  App.createPerson = function(overrides) {
    overrides = overrides || {};
    return Object.assign({
      id: App.uuid(),
      name: '未命名',
      gender: 'unknown',
      birthDate: '',
      deathDate: '',
      birthPlace: '',
      notes: '',
      photoUrl: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }, overrides, { createdAt: Date.now(), updatedAt: Date.now() });
  };

  App.createRelation = function(overrides) {
    overrides = overrides || {};
    return Object.assign({
      id: App.uuid(),
      type: 'parent-child',
      fromId: '',
      toId: '',
      notes: '',
      order: 0
    }, overrides);
  };

  App.getGenName = function(gen, generationNames) {
    if (generationNames && generationNames[gen] !== undefined) return generationNames[gen];
    var defaults = ['始祖','一世','二世','三世','四世','五世','六世','七世','八世','九世','十世',
      '十一世','十二世','十三世','十四世','十五世','十六世','十七世','十八世','十九世','二十世'];
    return gen < defaults.length ? defaults[gen] : ('第' + (gen + 1) + '代');
  };

  App.mutations = {
    addPerson: function(person) {
      return function(state) { state.persons[person.id] = person; };
    },
    updatePerson: function(id, updates) {
      return function(state) {
        if (state.persons[id]) Object.assign(state.persons[id], updates, { updatedAt: Date.now() });
      };
    },
    deletePerson: function(id) {
      return function(state) {
        delete state.persons[id];
        state.relations = state.relations.filter(function(r) { return r.fromId !== id && r.toId !== id; });
        if (state.rootPersonId === id) {
          var ids = Object.keys(state.persons);
          state.rootPersonId = ids.length ? ids[0] : null;
        }
      };
    },
    addRelation: function(rel) {
      return function(state) { state.relations.push(rel); };
    },
    updateRelation: function(id, updates) {
      return function(state) {
        var r = state.relations.find(function(r) { return r.id === id; });
        if (r) Object.assign(r, updates);
      };
    },
    deleteRelation: function(id) {
      return function(state) { state.relations = state.relations.filter(function(r) { return r.id !== id; }); };
    },
    setRoot: function(id) { return function(state) { state.rootPersonId = id; }; },
    setLayout: function(layout) { return function(state) { state.layout = layout; }; },
    importState: function(newState) { return function(state) { Object.assign(state, newState); }; },
    setGenerationName: function(gen, name) {
      return function(state) {
        if (!state.generationNames) state.generationNames = {};
        var def = App.getGenName(gen, {});
        if (name === def || name === '') delete state.generationNames[gen];
        else state.generationNames[gen] = name;
      };
    }
  };

  App.getSpouses = function(personId, state) {
    state = state || App.appState;
    return state.relations
      .filter(function(r) { return r.type === 'spouse' && (r.fromId === personId || r.toId === personId); })
      .map(function(r) { return r.fromId === personId ? r.toId : r.fromId; })
      .map(function(id) { return state.persons[id]; }).filter(Boolean);
  };

  App.getChildren = function(personId, state) {
    state = state || App.appState;
    var childRels = state.relations.filter(function(r) { return r.type === 'parent-child' && r.fromId === personId; });
    childRels.sort(function(a, b) { return (a.order || 0) - (b.order || 0); });
    var seen = new Set();
    return childRels.map(function(r) { return state.persons[r.toId]; }).filter(function(p) {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id); return true;
    });
  };

  App.getParents = function(personId, state) {
    state = state || App.appState;
    return state.relations
      .filter(function(r) { return r.type === 'parent-child' && r.toId === personId; })
      .map(function(r) { return r.fromId; })
      .map(function(id) { return state.persons[id]; }).filter(Boolean);
  };

  App.getSiblings = function(personId, state) {
    state = state || App.appState;
    var sibSet = new Set();
    // 通过共同父母查找兄弟姐妹
    var parents = App.getParents(personId, state);
    parents.forEach(function(p) {
      App.getChildren(p.id, state).forEach(function(c) { if (c.id !== personId) sibSet.add(c.id); });
    });
    // 通过 sibling 关系查找兄弟姐妹
    state.relations.filter(function(r) { return r.type === 'sibling' && (r.fromId === personId || r.toId === personId); })
      .forEach(function(r) {
        var sibId = r.fromId === personId ? r.toId : r.fromId;
        sibSet.add(sibId);
      });
    return Array.from(sibSet).map(function(id) { return state.persons[id]; }).filter(Boolean);
  };

  // 统一持久化入口（仅使用文件系统）
  App.persist = function() {
    // 如果已连接文件系统，保存到文件
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.persistToFileSystem().catch(function(err) {
        console.warn('File system save error', err);
      });
    }
    // 未连接时不保存数据（用户需要先连接文件夹）
  };

  // 从存储加载数据（仅从文件系统）
  App.loadFromStorage = function() {
    // 文件系统加载在 requestDirectoryAccess 中处理
    // 这里不做任何操作
    return false;
  };

  App.computeStats = function(state) {
    state = state || App.appState;
    var persons = Object.values(state.persons);
    var total = persons.length;
    var male = persons.filter(function(p) { return p.gender === 'male'; }).length;
    var female = persons.filter(function(p) { return p.gender === 'female'; }).length;
    var deceased = persons.filter(function(p) { return p.deathDate; }).length;
    var gens = App.computeGenerations(state);
    var genNums = Object.values(gens);
    var genCount = genNums.length ? (Math.max.apply(null, genNums) - Math.min.apply(null, genNums) + 1) : 0;
    var lifespans = persons.filter(function(p) { return p.birthDate && p.deathDate; })
      .map(function(p) { var b = parseInt(p.birthDate), d = parseInt(p.deathDate); return (isNaN(b)||isNaN(d)) ? null : d-b; })
      .filter(function(x) { return x !== null && x > 0 && x < 130; });
    var avgLifespan = lifespans.length ? Math.round(lifespans.reduce(function(a,b){return a+b;},0)/lifespans.length) : null;
    var living = persons.filter(function(p) { return p.birthDate && !p.deathDate; });
    var oldest = null;
    if (living.length) oldest = living.reduce(function(a,b) {
      var ay = parseInt(a.birthDate), by = parseInt(b.birthDate);
      return (isNaN(ay)||(!isNaN(by)&&by<ay)) ? b : a;
    });
    return { total: total, male: male, female: female, deceased: deceased, genCount: genCount, avgLifespan: avgLifespan, oldest: oldest };
  };

})(window.App = window.App || {});
