(function(App) {
  var MAX_VERSIONS = 50;
  var MAX_HISTORY = 100;

  function saveHistory() {
    // 仅保存到文件系统
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.persistHistoryToFileSystem().catch(function(err) {
        console.warn('History file save error', err);
      });
    }
  }

  App.history = {
    past: [],
    future: [],
    maxSize: 200,

    execute: function(cmd, label) {
      var stateBefore = App.deepClone(App.appState);
      cmd(App.appState);
      this.past.push({ label: label || '操作', stateBefore: stateBefore });
      if (this.past.length > this.maxSize) this.past.shift();
      this.future = [];
      App.persist();
      saveHistory();
      App.renderAll();
      App.updateHistoryPanel();
      App.updateUndoRedoBtns();
    },

    undo: function() {
      if (!this.past.length) return;
      var item = this.past.pop();
      this.future.push({ label: item.label, stateBefore: App.deepClone(App.appState) });
      App.appState = item.stateBefore;
      App.persist();
      saveHistory();
      App.renderAll();
      App.updateHistoryPanel();
      App.updateUndoRedoBtns();
      App.showToast('已撤销: ' + item.label);
    },

    redo: function() {
      if (!this.future.length) return;
      var item = this.future.pop();
      this.past.push({ label: item.label, stateBefore: App.deepClone(App.appState) });
      App.appState = item.stateBefore;
      App.persist();
      saveHistory();
      App.renderAll();
      App.updateHistoryPanel();
      App.updateUndoRedoBtns();
      App.showToast('已前进: ' + item.label);
    },

    canUndo: function() { return this.past.length > 0; },
    canRedo: function() { return this.future.length > 0; },

    load: function() {
      // 历史记录从文件系统加载，在 loadFromFileSystem 中处理
    }
  };

  // 从文件系统获取版本列表
  App.getVersions = function() {
    if (App.getVersionsFromFileSystem) {
      return App.getVersionsFromFileSystem();
    }
    return [];
  };

  // 保存版本
  App.saveVersion = function(label) {
    var now = new Date();
    var defaultLabel = now.getFullYear() + '-' +
      String(now.getMonth()+1).padStart(2,'0') + '-' +
      String(now.getDate()).padStart(2,'0') + ' ' +
      String(now.getHours()).padStart(2,'0') + ':' +
      String(now.getMinutes()).padStart(2,'0');

    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.saveVersionToFileSystem(label || defaultLabel).then(function(versionId) {
        if (versionId) {
          App.showToast('已保存版本: ' + (label || defaultLabel));
          App.updateHistoryPanel();
        }
      }).catch(function(err) {
        console.warn('Version save error', err);
        App.showToast('保存版本失败');
      });
    } else {
      App.showToast('请先连接文件夹');
    }
  };

  // 恢复版本
  App.restoreVersion = function(versionId) {
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.restoreVersionFromFileSystem(versionId);
    } else {
      App.showToast('请先连接文件夹');
    }
  };

  // 删除版本
  App.deleteVersion = function(versionId) {
    if (App.getConnectionStatus && App.getConnectionStatus() === 'connected') {
      App.deleteVersionFromFileSystem(versionId).then(function() {
        App.updateHistoryPanel();
        App.showToast('已删除版本');
      }).catch(function(err) {
        console.warn('Delete version error', err);
        App.showToast('删除失败');
      });
    }
  };

  // 兼容旧代码
  App.loadHistoryFromStorage = function() {
    // 历史记录从文件系统加载，在 loadFromFileSystem 中处理
  };

})(window.App = window.App || {});
