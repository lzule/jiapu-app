(function(App) {
  var DEFAULT_SHORTCUTS = {
    undo:          { key: 'z',          ctrl: true,  shift: false, alt: false, label: '撤销' },
    redo:          { key: 'y',          ctrl: true,  shift: false, alt: false, label: '前进' },
    save:          { key: 's',          ctrl: true,  shift: false, alt: false, label: '保存版本' },
    addPerson:     { key: 'n',          ctrl: true,  shift: true,  alt: false, label: '添加人物' },
    editPerson:    { key: 'e',          ctrl: true,  shift: false, alt: false, label: '编辑选中人物' },
    deletePerson:  { key: 'Delete',     ctrl: false, shift: false, alt: false, label: '删除选中人物' },
    search:        { key: 'f',          ctrl: true,  shift: false, alt: false, label: '搜索' },
    fitScreen:     { key: '0',          ctrl: true,  shift: false, alt: false, label: '适应屏幕' },
    zoomIn:        { key: '=',          ctrl: true,  shift: false, alt: false, label: '放大' },
    zoomOut:       { key: '-',          ctrl: true,  shift: false, alt: false, label: '缩小' },
    shortcutsHelp: { key: '/',          ctrl: true,  shift: false, alt: false, label: '快捷键帮助' },
    toggleSidebar: { key: 'b',          ctrl: true,  shift: false, alt: false, label: '切换侧边栏' },
    navUp:         { key: 'ArrowUp',    ctrl: false, shift: false, alt: false, label: '导航上' },
    navDown:       { key: 'ArrowDown',  ctrl: false, shift: false, alt: false, label: '导航下' },
    navLeft:       { key: 'ArrowLeft',  ctrl: false, shift: false, alt: false, label: '导航左' },
    navRight:      { key: 'ArrowRight', ctrl: false, shift: false, alt: false, label: '导航右' },
    reorderSiblingLeft:  { key: 'ArrowLeft',  ctrl: true, shift: true,  alt: false, label: '同辈左移一位' },
    reorderSiblingRight: { key: 'ArrowRight', ctrl: true, shift: true,  alt: false, label: '同辈右移一位' },
    escape:        { key: 'Escape',     ctrl: false, shift: false, alt: false, label: '取消/关闭' },
    // 右键菜单快捷键
    menuAddSpouse:    { key: 'a', ctrl: false, shift: false, alt: false, label: '菜单-添加配偶' },
    menuAddChild:     { key: 's', ctrl: false, shift: false, alt: false, label: '菜单-添加子女' },
    menuAddParent:    { key: 'd', ctrl: false, shift: false, alt: false, label: '菜单-添加父母' },
    menuAddSibling:   { key: 'f', ctrl: false, shift: false, alt: false, label: '菜单-添加兄弟姐妹' },
    menuEdit:         { key: 'e', ctrl: false, shift: false, alt: false, label: '菜单-编辑信息' },
    menuDelete:       { key: 'x', ctrl: false, shift: false, alt: false, label: '菜单-删除此人' },
    // Alt+拖拽关系菜单快捷键
    relSetSpouse:     { key: 'a', ctrl: false, shift: false, alt: false, label: '关系-设为配偶' },
    relSetParent:     { key: 'd', ctrl: false, shift: false, alt: false, label: '关系-设为父母' },
    relSetChild:      { key: 's', ctrl: false, shift: false, alt: false, label: '关系-设为子女' },
    relSetSibling:    { key: 'f', ctrl: false, shift: false, alt: false, label: '关系-设兄弟姐妹' }
  };

  var shortcuts = {};
  var recordingAction = null;
  var MENU_SHORTCUT_ACTIONS = {
    menuAddSpouse: true,
    menuAddChild: true,
    menuAddParent: true,
    menuAddSibling: true,
    menuEdit: true,
    menuDelete: true,
    relSetSpouse: true,
    relSetParent: true,
    relSetChild: true,
    relSetSibling: true
  };

  function loadShortcuts() {
    // 优先从内存加载（已从文件系统加载）
    if (App._shortcuts) {
      Object.keys(DEFAULT_SHORTCUTS).forEach(function(action) {
        shortcuts[action] = App._shortcuts[action] || deepCloneShortcut(DEFAULT_SHORTCUTS[action]);
      });
    } else {
      resetToDefaults();
    }
  }

  function saveShortcuts() {
    // 保存到内存
    App._shortcuts = {};
    Object.keys(shortcuts).forEach(function(action) {
      App._shortcuts[action] = deepCloneShortcut(shortcuts[action]);
    });

    // 更新菜单中的快捷键显示
    App.updateMenuShortcuts && App.updateMenuShortcuts();

    // 保存到文件系统
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.persistShortcutsToFileSystem && App.persistShortcutsToFileSystem();
    }
  }

  function deepCloneShortcut(s) {
    return { key: s.key, ctrl: s.ctrl, shift: s.shift, alt: s.alt, label: s.label };
  }

  function resetToDefaults() {
    shortcuts = {};
    Object.keys(DEFAULT_SHORTCUTS).forEach(function(action) {
      shortcuts[action] = deepCloneShortcut(DEFAULT_SHORTCUTS[action]);
    });
    saveShortcuts();
  }

  function shortcutToString(s) {
    if (!s) return '';
    var parts = [];
    if (s.ctrl) parts.push('Ctrl');
    if (s.alt) parts.push('Alt');
    if (s.shift) parts.push('Shift');
    var keyDisplay = s.key;
    if (keyDisplay === ' ') keyDisplay = 'Space';
    else if (keyDisplay === 'Delete') keyDisplay = 'Del';
    else if (keyDisplay === 'Escape') keyDisplay = 'Esc';
    else if (keyDisplay === 'ArrowUp') keyDisplay = '↑';
    else if (keyDisplay === 'ArrowDown') keyDisplay = '↓';
    else if (keyDisplay === 'ArrowLeft') keyDisplay = '←';
    else if (keyDisplay === 'ArrowRight') keyDisplay = '→';
    parts.push(keyDisplay.length === 1 ? keyDisplay.toUpperCase() : keyDisplay);
    return parts.join('+');
  }

  function findConflict(action, newShortcut) {
    var keys = Object.keys(shortcuts);
    for (var i = 0; i < keys.length; i++) {
      var a = keys[i];
      if (a === action) continue;
      var s = shortcuts[a];
      if (s.key.toLowerCase() === newShortcut.key.toLowerCase() &&
          s.ctrl === newShortcut.ctrl && s.alt === newShortcut.alt && s.shift === newShortcut.shift) {
        return a;
      }
    }
    return null;
  }

  function normalizeShortcutKey(key) {
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function matchShortcut(e, action) {
    var s = shortcuts[action];
    if (!s) return false;
    var keyMatch = e.key.toLowerCase() === s.key.toLowerCase() ||
      (e.key === s.key);
    if (!keyMatch) {
      if (s.key === '=' && (e.key === '=' || e.key === '+')) keyMatch = true;
      else if (s.key === '-' && e.key === '-') keyMatch = true;
    }
    return keyMatch && (e.ctrlKey || e.metaKey) === s.ctrl && e.altKey === s.alt && e.shiftKey === s.shift;
  }

  App.initKeyboard = function() {
    loadShortcuts();
    App.updateMenuShortcuts && App.updateMenuShortcuts();

    document.addEventListener('keydown', function(e) {
      if (recordingAction) {
        if (e.key === 'Escape') {
          recordingAction = null;
          App.renderShortcutsModal();
          return;
        }
        // 如果只按了修饰键，继续等待，不立即保存
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
          e.preventDefault();
          var hintEl = document.querySelector('.shortcut-key.recording');
          if (hintEl) hintEl.textContent = '按下组合键...';
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // 菜单快捷键只允许单键，避免与全局快捷键和输入焦点冲突
        var isMenuAction = !!MENU_SHORTCUT_ACTIONS[recordingAction];
        if (isMenuAction && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)) {
          var menuHintEl = document.querySelector('.shortcut-key.recording');
          if (menuHintEl) menuHintEl.textContent = '菜单快捷键仅支持单键';
          return;
        }

        var newShortcut = {
          key: normalizeShortcutKey(e.key),
          ctrl: e.ctrlKey || e.metaKey,
          shift: e.shiftKey,
          alt: e.altKey,
          label: shortcuts[recordingAction].label
        };
        var conflict = findConflict(recordingAction, newShortcut);
        shortcuts[recordingAction] = newShortcut;
        saveShortcuts();
        recordingAction = null;
        App.renderShortcutsModal(conflict);
        return;
      }

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        if (matchShortcut(e, 'escape')) {
          e.target.blur();
        }
        return;
      }

      if (matchShortcut(e, 'undo')) { e.preventDefault(); App.history.undo(); return; }
      if (matchShortcut(e, 'redo')) { e.preventDefault(); App.history.redo(); return; }
      if (matchShortcut(e, 'save')) { e.preventDefault(); App.openSavePopover(); return; }
      if (matchShortcut(e, 'addPerson')) { e.preventDefault(); App.openPersonModal(null); return; }
      if (matchShortcut(e, 'editPerson')) {
        e.preventDefault();
        if (App.selectedPersonId) App.openPersonModal(App.selectedPersonId);
        return;
      }
      if (matchShortcut(e, 'deletePerson')) {
        if (App.selectedPersonId) {
          var p = App.appState.persons[App.selectedPersonId];
          if (p && confirm('确定删除 "' + p.name + '"？')) {
            App.history.execute(App.mutations.deletePerson(App.selectedPersonId), '删除 ' + p.name);
            App.selectPerson(null);
          }
        }
        return;
      }
      if (matchShortcut(e, 'search')) { e.preventDefault(); App.toggleSearch(); return; }
      if (matchShortcut(e, 'fitScreen')) { e.preventDefault(); App.fitToScreen(); return; }
      if (matchShortcut(e, 'zoomIn')) { e.preventDefault(); App.vp.scale = Math.min(4, App.vp.scale * 1.2); App.applyViewport(); return; }
      if (matchShortcut(e, 'zoomOut')) { e.preventDefault(); App.vp.scale = Math.max(0.1, App.vp.scale / 1.2); App.applyViewport(); return; }
      if (matchShortcut(e, 'shortcutsHelp')) { e.preventDefault(); App.openShortcutsModal(); return; }
      if (matchShortcut(e, 'toggleSidebar')) { e.preventDefault(); App.toggleSidebar(); return; }
      if (matchShortcut(e, 'reorderSiblingLeft')) {
        e.preventDefault();
        if (App.moveSiblingByStep) {
          var leftResult = App.moveSiblingByStep(App.selectedPersonId, -1);
          if (leftResult && leftResult.message) App.showToast(leftResult.message);
        }
        return;
      }
      if (matchShortcut(e, 'reorderSiblingRight')) {
        e.preventDefault();
        if (App.moveSiblingByStep) {
          var rightResult = App.moveSiblingByStep(App.selectedPersonId, 1);
          if (rightResult && rightResult.message) App.showToast(rightResult.message);
        }
        return;
      }
      if (matchShortcut(e, 'navUp') || matchShortcut(e, 'navDown') || matchShortcut(e, 'navLeft') || matchShortcut(e, 'navRight')) { e.preventDefault(); App.navigateWithArrow(e); return; }
      if (matchShortcut(e, 'escape')) {
        App.closePersonModal(); App.closeContextMenu(); App.closeEdgePopover(); App.closeSearch();
        App.closeSavePopover(); App.closeShortcutsModal(); App.closeToolbarMoreMenu && App.closeToolbarMoreMenu();
        App.closePhotoViewer && App.closePhotoViewer(); App.selectPerson(null);
        return;
      }
    });
  };

  App.openShortcutsModal = function() {
    recordingAction = null;
    document.getElementById('shortcuts-overlay').classList.add('open');
    App.renderShortcutsModal();
  };

  App.closeShortcutsModal = function() {
    recordingAction = null;
    document.getElementById('shortcuts-overlay').classList.remove('open');
  };

  App.renderShortcutsModal = function(conflictAction) {
    var container = document.getElementById('shortcuts-list');
    if (!container) return;
    var html = '';
    Object.keys(shortcuts).forEach(function(action) {
      var s = shortcuts[action];
      var isRecording = recordingAction === action;
      var isConflict = conflictAction === action && action !== recordingAction;
      var keyStr = isRecording ? '按下新快捷键...' : shortcutToString(s);
      var cls = 'shortcut-key' + (isRecording ? ' recording' : '') + (isConflict ? ' conflict' : '');
      html += '<div class="shortcut-row">'
        + '<span class="shortcut-action">' + s.label + '</span>'
        + '<span class="' + cls + '" data-record="' + action + '">' + keyStr + '</span>'
        + '<button class="shortcut-reset" data-reset="' + action + '">重置</button>'
        + '</div>';
    });
    html += '<div style="padding:12px 16px;text-align:right">'
      + '<button class="btn btn-secondary" id="reset-all-shortcuts" style="font-size:12px;padding:4px 12px">全部重置</button> '
      + '<button class="btn btn-primary" id="close-shortcuts-btn" style="font-size:12px;padding:4px 12px">关闭</button></div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-record]').forEach(function(el) {
      el.addEventListener('click', function() {
        recordingAction = el.dataset.record;
        App.renderShortcutsModal();
      });
    });
    container.querySelectorAll('[data-reset]').forEach(function(el) {
      el.addEventListener('click', function() {
        var action = el.dataset.reset;
        shortcuts[action] = deepCloneShortcut(DEFAULT_SHORTCUTS[action]);
        saveShortcuts();
        recordingAction = null;
        App.renderShortcutsModal();
      });
    });
    var resetAll = document.getElementById('reset-all-shortcuts');
    if (resetAll) resetAll.addEventListener('click', function() { resetToDefaults(); recordingAction = null; App.renderShortcutsModal(); });
    var closeBtn = document.getElementById('close-shortcuts-btn');
    if (closeBtn) closeBtn.addEventListener('click', function() { App.closeShortcutsModal(); });
  };

  App.getShortcutString = function(action) {
    return shortcutToString(shortcuts[action]);
  };

  App.getShortcutConfig = function(action) {
    var s = shortcuts[action];
    return s ? deepCloneShortcut(s) : null;
  };

  App.matchesShortcutEvent = function(e, action) {
    return matchShortcut(e, action);
  };

  // 供文件系统模块在加载快捷键配置后调用，重新应用到键盘处理器
  App.reloadShortcuts = function() {
    loadShortcuts();
    App.updateMenuShortcuts && App.updateMenuShortcuts();
  };

  // 更新右键菜单和关系菜单中的快捷键显示
  App.updateMenuShortcuts = function() {
    // 右键菜单快捷键映射
    var ctxMenuShortcuts = {
      'add-spouse': 'menuAddSpouse',
      'add-child': 'menuAddChild',
      'add-parent': 'menuAddParent',
      'add-sibling': 'menuAddSibling',
      'edit': 'menuEdit',
      'delete': 'menuDelete'
    };

    // 关系菜单快捷键映射
    var relMenuShortcuts = {
      'spouse': 'relSetSpouse',
      'parent': 'relSetParent',
      'child': 'relSetChild',
      'sibling': 'relSetSibling'
    };

    // 更新右键菜单
    var ctxMenu = document.getElementById('ctx-menu');
    if (ctxMenu) {
      Object.keys(ctxMenuShortcuts).forEach(function(action) {
        var item = ctxMenu.querySelector('[data-action="' + action + '"]');
        if (item) {
          var shortcutKey = shortcuts[ctxMenuShortcuts[action]];
          if (shortcutKey) {
            var shortcutSpan = item.querySelector('.ctx-shortcut');
            if (shortcutSpan) {
              shortcutSpan.textContent = shortcutToString(shortcutKey);
            }
          }
        }
      });
    }

    // 更新关系菜单
    var relMenu = document.getElementById('relation-menu');
    if (relMenu) {
      Object.keys(relMenuShortcuts).forEach(function(relation) {
        var item = relMenu.querySelector('[data-relation="' + relation + '"]');
        if (item) {
          var shortcutKey = shortcuts[relMenuShortcuts[relation]];
          if (shortcutKey) {
            var shortcutSpan = item.querySelector('.ctx-shortcut');
            if (shortcutSpan) {
              shortcutSpan.textContent = shortcutToString(shortcutKey);
            }
          }
        }
      });
    }
  };

})(window.App = window.App || {});
