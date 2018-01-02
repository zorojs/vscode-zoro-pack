// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
require('json5/lib/require');
const vscode = require('vscode');
const _ = require('lodash');
const shell = require('shelljs');
const Promise = require('bluebird');
const config = require('./lib/config.json');
const settingsToMerge = require('./lib/settings.json5');
const settingsToOverride = require('./lib/settings-override.json5');
const regIgnore = require('./lib/settings-ignore');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
function activate(context) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  log('Congratulations, your extension "vscode-extension-pack" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const installCodeExtensionsDisposable = vscode.commands.registerCommand(
    'extension.installCodeExtensions',
    () => {
      installCodeExtensions();
    }
  );
  context.subscriptions.push(installCodeExtensionsDisposable);

  const updateSettingsWithoutOverrideDisposable = vscode.commands.registerCommand(
    'extension.updateSettingsWithoutOverride',
    () => {
      return updateSettings();
    }
  );
  context.subscriptions.push(updateSettingsWithoutOverrideDisposable);

  const updateSettingsWithOverrideDisposable = vscode.commands.registerCommand(
    'extension.updateSettingsWithOverride',
    () => {
      return updateSettings({ override: true });
    }
  );
  context.subscriptions.push(updateSettingsWithOverrideDisposable);

  const vmUtl8Disposable = vscode.commands.registerCommand(
    'extension.vmutf8',
    () => {
      return updateVmEncoding();
    }
  );
  context.subscriptions.push(vmUtl8Disposable);

  const vmGbkDisposable = vscode.commands.registerCommand(
    'extension.vmgbk',
    () => {
      return updateVmEncoding('gbk');
    }
  );
  context.subscriptions.push(vmGbkDisposable);

  const disableHtmlFormatDisposable = vscode.commands.registerCommand(
    'extension.disableHtmlFormat',
    () => {
      return disableHtmlFormat();
    }
  );
  context.subscriptions.push(disableHtmlFormatDisposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;

function installCodeExtensions() {
  if (!shell.which('code')) {
    toast('请先安装 code 命令行工具');
    return;
  }
  shell.exec('code --list-extensions', (code, stdout, stderr) => {
    if (code === 0) {
      const extensionInstalled = stdout.replace('\r', '').split('\n');
      const extensionToInstall = _.difference(
        config.extensionDependencies,
        extensionInstalled
      );
      if (extensionToInstall.length) {
        toast(`即将安装 ${extensionToInstall.length} 个插件, 请稍候`);
        console.log('extensionToInstall', extensionToInstall);
        Promise.each(extensionToInstall, installCodeExtension).then(() => {
          toast('插件全部安装完成, 请更新配置后重启 vscode 来激活插件');
        });
      } else {
        toast('插件已存在, 无需安装');
      }
    }
  });
}

function installCodeExtension(extension) {
  return new Promise((resolve, reject) => {
    shell.exec(
      `code --install-extension ${extension}`,
      (code, stdout, stderr) => {
        if (code !== 0) {
          toast('' + stderr);
        }
        resolve();
      }
    );
  });
}

function updateVmEncoding(charset = 'utf8') {
  return updateSettings({
    override: true,
    settings: {
      '[velocity]': {
        'files.encoding': charset
      }
    },
    target: vscode.ConfigurationTarget.Workspace,
    toastMsg: `Change workspace vm charset to ${charset}. You can find the settings under .vscode folder in the root of your project. You should commit this folder.`
  });
}

function disableHtmlFormat() {
  return updateSettings({
    override: true,
    settings: {
      'html.format.enable': false
    },
    target: vscode.ConfigurationTarget.Workspace,
    toastMsg: 'html format disabled!'
  });
}

function updateSettings(options = {}) {
  const {
    override,
    toastMsg,
    settings = _.merge({}, settingsToMerge, settingsToOverride),
    target = vscode.ConfigurationTarget.Global
  } = options;
  // The code you place here will be executed every time your command is executed

  const configuration = vscode.workspace.getConfiguration(null, null);

  const keys = Object.keys(settings).sort();
  const updatedKeys = [];
  const ignoreKeys = [];

  const promises = keys.map(key => {
    let inspectTarget = 'globalValue';
    if (target === vscode.ConfigurationTarget.Workspace) {
      inspectTarget = 'workspaceValue';
    }
    const prevValue = configuration.inspect(key)[inspectTarget];
    const updatedValue = settings[key];
    const unchanged = _.isEqual(prevValue, updatedValue);
    // 以下场景忽略
    // - 命中忽略
    // - 值没有更新
    // - 原来有值, 且值更新了, 但是不覆盖
    if (
      regIgnore.test(key) ||
      unchanged ||
      (prevValue !== undefined && !unchanged && !override)
    ) {
      ignoreKeys.push(key);
      return Promise.resolve();
    }
    // 更新
    log(`update [${key}]`, 'from', prevValue, 'to', updatedValue);
    updatedKeys.push(key);
    let value = updatedValue;
    if (_.isPlainObject(updatedValue)) {
      value = _.merge({}, prevValue, updatedValue);
    } else if (_.isArray(updatedValue)) {
      value = [...(prevValue || []), ...updatedValue];
    }
    return configuration.update(key, value, target);
  });

  return Promise.all(promises).then(
    () => {
      // Display a message box to the user
      log('updated keys', updatedKeys);
      log('ignored keys', ignoreKeys);
      toast(
        toastMsg ||
          `Update settings done: ${updatedKeys.length} updated, ${
            ignoreKeys.length
          } ignored`
      );
    },
    err => {
      toast(err.message);
    }
  );
}

function formatMsg(msg) {
  const firstChar = msg.charAt(0);
  if (
    (firstChar > 'A' && firstChar < 'Z') ||
    (firstChar > 'a' && firstChar < 'z')
  ) {
    msg = msg[0].toUpperCase() + msg.slice(1);
  }
  return '[zoro] ' + msg;
}

function formatSentense(msg) {
  const dot = msg[msg.length - 1] === '.' ? '' : '.';
  return formatMsg(msg) + dot;
}

function log(msg, ...args) {
  console.log(formatMsg(msg), ...args);
}

function toast(msg) {
  vscode.window.showInformationMessage(`${formatSentense(msg)}`);
}
