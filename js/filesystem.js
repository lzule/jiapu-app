/**
 * File System Access API 封装模块
 * 用于将家谱数据保存到本地文件系统
 */
(function(App) {
  'use strict';

  // ========== 常量定义 ==========
  var FS_API_SUPPORTED = 'showDirectoryPicker' in window;
  var DATA_DIR = 'data';
  var VERSIONS_DIR = 'versions';

  // ========== 状态管理 ==========
  var directoryHandle = null;
  var isInitialized = false;
  var isConnecting = false;
  var lastSyncTime = 0;
  var autoSyncInterval = null;
  var versionsCache = [];

  // ========== 工具函数 ==========
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function formatDate(d) {
    var date = new Date(d);
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0') + '_' +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      String(date.getSeconds()).padStart(2, '0');
  }

  // ========== 核心存储适配器 ==========

  /**
   * 检查 File System Access API 是否可用
   */
  App.isFileSystemSupported = function() {
    return FS_API_SUPPORTED;
  };

  /**
   * 获取当前连接状态
   */
  App.getConnectionStatus = function() {
    if (!FS_API_SUPPORTED) return 'unsupported';
    if (directoryHandle && isInitialized) return 'connected';
    return 'disconnected';
  };

  /**
   * 检查是否需要显示欢迎弹窗
   */
  App.shouldShowWelcome = function() {
    return FS_API_SUPPORTED && !isInitialized;
  };

  /**
   * 请求目录访问权限
   */
  App.requestDirectoryAccess = async function() {
    if (!FS_API_SUPPORTED) {
      App.showUnsupportedMessage();
      return false;
    }

    try {
      isConnecting = true;
      App.updateConnectionUI('connecting');

      // 弹出目录选择器，默认从桌面开始（jiapu_app 文件夹在桌面上）
      var handle = await window.showDirectoryPicker({
        mode: 'readwrite',
        startIn: 'desktop'
      });

      directoryHandle = handle;

      // 创建必要的目录结构
      await ensureDirectoryStructure();

      isInitialized = true;
      isConnecting = false;
      lastSyncTime = Date.now();

      // 关闭欢迎弹窗
      App.closeWelcomeModal && App.closeWelcomeModal();

      // 更新 UI 显示文件夹名称
      App.updateConnectionUI('connected');
      App.updateFolderInfo && App.updateFolderInfo(handle.name);

      App.showToast('已连接到: ' + handle.name);

      // 尝试加载数据
      var loaded = await App.loadFromFileSystem();
      if (loaded) {
        App.renderAll();
        App.updateHistoryPanel();
        App.showToast('已加载数据');
      } else {
        // 没有现有数据，保存初始空数据
        await App.persistToFileSystem();
        await App.persistHistoryToFileSystem();
      }

      // 启动自动同步
      App.startAutoSync(30000);

      return true;
    } catch (err) {
      isConnecting = false;
      App.updateConnectionUI('disconnected');

      if (err.name === 'AbortError') {
        return false;
      }
      console.error('连接文件夹失败', err);
      App.showToast('连接失败: ' + err.message);
      return false;
    }
  };

  /**
   * 显示不支持浏览器的提示
   */
  App.showUnsupportedMessage = function() {
    App.showToast('请使用 Chrome 或 Edge 浏览器');
    App.showBrowserUnsupported && App.showBrowserUnsupported();
  };

  /**
   * 确保目录结构存在
   */
  async function ensureDirectoryStructure() {
    if (!directoryHandle) return;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR, { create: true });
      await dataDir.getDirectoryHandle(VERSIONS_DIR, { create: true });
    } catch (err) {
      console.error('创建目录结构失败', err);
      throw err;
    }
  }

  /**
   * 从文件系统加载数据
   */
  App.loadFromFileSystem = async function() {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);

      // 加载主状态
      var stateData = await readJsonFile(dataDir, 'state.json');
      if (stateData) {
        App.appState = Object.assign(App.deepClone(App.DEFAULT_STATE), stateData);
        delete App.appState._meta;
      }

      // 加载历史
      var historyData = await readJsonFile(dataDir, 'history.json');
      if (historyData) {
        App.history.past = historyData.past || [];
        App.history.future = historyData.future || [];
      }

      // 加载快捷键，并立即重新应用到键盘处理器
      var shortcutsData = await readJsonFile(dataDir, 'shortcuts.json');
      if (shortcutsData) {
        App._shortcuts = shortcutsData;
        // 重新加载快捷键配置（updateShortcuts 需要在 shortcuts.js 中定义）
        App.reloadShortcuts && App.reloadShortcuts();
      }

      // 加载设置，并立即应用（如自动保存间隔）
      var settingsData = await readJsonFile(dataDir, 'settings.json');
      if (settingsData) {
        App._settings = settingsData;
        App._applySettings && App._applySettings(settingsData);
      }

      // 加载版本列表
      await App.refreshVersionsCache();

      lastSyncTime = Date.now();
      return true;
    } catch (err) {
      console.warn('从文件系统加载失败', err);
      return false;
    }
  };

  /**
   * 读取 JSON 文件
   */
  async function readJsonFile(dirHandle, fileName) {
    try {
      var fileHandle = await dirHandle.getFileHandle(fileName);
      var file = await fileHandle.getFile();
      var text = await file.text();
      return JSON.parse(text);
    } catch (err) {
      if (err.name === 'NotFoundError') return null;
      throw err;
    }
  }

  /**
   * 写入 JSON 文件
   */
  async function writeJsonFile(dirHandle, fileName, data) {
    var fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    var writable = await fileHandle.createWritable();
    var jsonStr = JSON.stringify(data, null, 2);
    await writable.write(jsonStr);
    await writable.close();
  }

  /**
   * 持久化保存到文件系统
   */
  App.persistToFileSystem = async function() {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var stateData = deepClone(App.appState);
      stateData._meta = { lastModified: Date.now() };
      await writeJsonFile(dataDir, 'state.json', stateData);
      lastSyncTime = Date.now();
      return true;
    } catch (err) {
      console.error('保存失败', err);
      return false;
    }
  };

  /**
   * 保存历史记录
   */
  App.persistHistoryToFileSystem = async function() {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var historyData = {
        past: App.history.past.slice(-100),
        future: App.history.future.slice(-100),
        _meta: { lastModified: Date.now() }
      };
      await writeJsonFile(dataDir, 'history.json', historyData);
      return true;
    } catch (err) {
      console.warn('保存历史失败', err);
      return false;
    }
  };

  /**
   * 保存快捷键设置
   */
  App.persistShortcutsToFileSystem = async function() {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var shortcutsData = App._shortcuts || {};
      await writeJsonFile(dataDir, 'shortcuts.json', shortcutsData);
      return true;
    } catch (err) {
      console.warn('保存快捷键失败', err);
      return false;
    }
  };

  /**
   * 保存应用设置
   */
  App.persistSettingsToFileSystem = async function(settings) {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      App._settings = settings;
      await writeJsonFile(dataDir, 'settings.json', settings);
      return true;
    } catch (err) {
      console.warn('保存设置失败', err);
      return false;
    }
  };

  /**
   * 保存版本快照
   */
  App.saveVersionToFileSystem = async function(label) {
    if (!directoryHandle || !isInitialized) return null;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var versionsDir = await dataDir.getDirectoryHandle(VERSIONS_DIR);

      var versionId = 'v_' + formatDate(Date.now());
      var fileName = versionId + '.json';

      var versionData = {
        id: versionId,
        label: label || formatDate(Date.now()),
        timestamp: Date.now(),
        state: App.deepClone(App.appState)
      };

      await writeJsonFile(versionsDir, fileName, versionData);

      versionsCache.unshift({
        id: versionId,
        label: versionData.label,
        timestamp: versionData.timestamp,
        fileName: fileName
      });
      if (versionsCache.length > 50) versionsCache.length = 50;

      return versionId;
    } catch (err) {
      console.error('保存版本失败', err);
      return null;
    }
  };

  /**
   * 从文件系统恢复版本
   */
  App.restoreVersionFromFileSystem = async function(versionId) {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var versionsDir = await dataDir.getDirectoryHandle(VERSIONS_DIR);

      var v = versionsCache.find(function(item) { return item.id === versionId; });
      if (!v) {
        App.showToast('版本不存在');
        return false;
      }

      var versionData = await readJsonFile(versionsDir, v.fileName);
      if (!versionData || !versionData.state) {
        App.showToast('版本数据损坏');
        return false;
      }

      var restoredState = deepClone(versionData.state);
      delete restoredState._meta;

      App.history.execute(function(state) {
        Object.keys(state).forEach(function(k) { delete state[k]; });
        Object.assign(state, restoredState);
      }, '恢复版本: ' + v.label);

      return true;
    } catch (err) {
      console.error('恢复版本失败', err);
      App.showToast('恢复失败');
      return false;
    }
  };

  /**
   * 刷新版本列表缓存
   */
  App.refreshVersionsCache = async function() {
    if (!directoryHandle || !isInitialized) return;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var versionsDir = await dataDir.getDirectoryHandle(VERSIONS_DIR);

      versionsCache = [];
      for await (var entry of versionsDir.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          try {
            var file = await entry.getFile();
            var text = await file.text();
            var data = JSON.parse(text);
            versionsCache.push({
              id: data.id,
              label: data.label,
              timestamp: data.timestamp,
              fileName: entry.name
            });
          } catch (e) {}
        }
      }

      versionsCache.sort(function(a, b) { return b.timestamp - a.timestamp; });
      if (versionsCache.length > 50) versionsCache.length = 50;
    } catch (err) {
      console.warn('刷新版本列表失败', err);
    }
  };

  /**
   * 从内存缓存获取版本列表
   */
  App.getVersionsFromFileSystem = function() {
    return versionsCache;
  };

  /**
   * 删除版本
   */
  App.deleteVersionFromFileSystem = async function(versionId) {
    if (!directoryHandle || !isInitialized) return false;

    try {
      var dataDir = await directoryHandle.getDirectoryHandle(DATA_DIR);
      var versionsDir = await dataDir.getDirectoryHandle(VERSIONS_DIR);

      var v = versionsCache.find(function(item) { return item.id === versionId; });
      if (!v) return false;

      await versionsDir.removeEntry(v.fileName);
      versionsCache = versionsCache.filter(function(item) { return item.id !== versionId; });

      return true;
    } catch (err) {
      console.error('删除版本失败', err);
      return false;
    }
  };

  /**
   * 断开文件系统连接
   */
  App.disconnectFileSystem = function() {
    directoryHandle = null;
    isInitialized = false;
    App.stopAutoSync();
    App.updateConnectionUI('disconnected');
    App.updateFolderInfo && App.updateFolderInfo(null);
    App.showToast('已断开连接');

    if (App.shouldShowWelcome()) {
      App.showWelcomeModal && App.showWelcomeModal();
    }
  };

  /**
   * 获取目录信息
   */
  App.getDirectoryInfo = function() {
    if (!directoryHandle) return null;
    return {
      name: directoryHandle.name,
      lastSync: lastSyncTime ? new Date(lastSyncTime).toLocaleString() : '从未同步'
    };
  };

  /**
   * 启动自动同步
   */
  App.startAutoSync = function(intervalMs) {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    intervalMs = intervalMs || 30000;

    autoSyncInterval = setInterval(async function() {
      if (directoryHandle && isInitialized) {
        await App.persistToFileSystem();
      }
    }, intervalMs);
  };

  /**
   * 停止自动同步
   */
  App.stopAutoSync = function() {
    if (autoSyncInterval) {
      clearInterval(autoSyncInterval);
      autoSyncInterval = null;
    }
  };

  /**
   * 初始化文件系统模块
   */
  App.initFileSystem = async function() {
    if (!FS_API_SUPPORTED) {
      App.updateConnectionUI('unsupported');
      return false;
    }
    App.updateConnectionUI('disconnected');
    return true;
  };

})(window.App = window.App || {});
