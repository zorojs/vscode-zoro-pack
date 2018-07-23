// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
require('json5/lib/require');
const vscode = require('vscode');
const _ = require('lodash');
const shell = require('shelljs');
const Promise = require('bluebird');
const config = require('./lib/config');
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
      installCodeExtensions(config.extensions);
    }
  );
  context.subscriptions.push(installCodeExtensionsDisposable);

  const installCodeSyntaxExtensionsDisposable = vscode.commands.registerCommand(
    'extension.installCodeSyntaxExtensions',
    () => {
      installCodeExtensions(config.syntaxExtensions);
    }
  );
  context.subscriptions.push(installCodeSyntaxExtensionsDisposable);

  const installCodeInsidersExtensionsDisposable = vscode.commands.registerCommand(
    'extension.installCodeInsidersExtensions',
    () => {
      installCodeExtensions(config.extensions, 'code-insiders');
    }
  );
  context.subscriptions.push(installCodeInsidersExtensionsDisposable);
  context.subscriptions.push(installCodeSyntaxExtensionsDisposable);

  const installCodeInsidersSyntaxExtensionsDisposable = vscode.commands.registerCommand(
    'extension.installCodeInsidersSyntaxExtensions',
    () => {
      installCodeExtensions(config.syntaxExtensions, 'code-insiders');
    }
  );
  context.subscriptions.push(installCodeInsidersSyntaxExtensionsDisposable);

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

  const htmlToNunjucksDisposable = vscode.commands.registerCommand(
    'extension.htmlToNunjucks',
    () => {
      return htmlToNunjucks();
    }
  );
  context.subscriptions.push(htmlToNunjucksDisposable);
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() {}
exports.deactivate = deactivate;

function installCodeExtensions(extensions, cmd = 'code') {
  if (!shell.which(cmd)) {
    toast('请先安装 code 命令行工具');
    return;
  }
  shell.exec(`${cmd} --list-extensions`, (code, stdout, stderr) => {
    if (code === 0) {
      const extensionsInstalled = stdout.replace('\r', '').split('\n');
      const extensionsToInstall = _.difference(extensions, extensionsInstalled);
      if (extensionsToInstall.length) {
        toast(`即将安装 ${extensionsToInstall.length} 个插件, 请稍候`);
        console.log('extensionToInstall', extensionsToInstall);
        Promise.each(extensionsToInstall, extension => {
          installCodeExtension({
            extension,
            cmd
          });
        }).then(() => {
          console.log('zoro, all plugins has been installed');
          toast('插件全部安装完成, 请更新配置后重启 vscode 来激活插件');
        });
      } else {
        console.log('zoro: you already have all the plugins installed');
        toast('插件已存在, 无需安装');
      }
    }
  });
}

function installCodeExtension({ extension, cmd }) {
  return new Promise((resolve, reject) => {
    shell.exec(
      `${cmd} --install-extension ${extension}`,
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

function htmlToNunjucks() {
  return updateSettings({
    override: true,
    settings: {
      'files.associations': {
        '*.html': 'nunjucks'
      }
    },
    target: vscode.ConfigurationTarget.Workspace,
    toastMsg: 'html highlight with nunjucks!'
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
    const inspectTarget =
      target === vscode.ConfigurationTarget.Workspace
        ? 'workspaceValue'
        : 'globalValue';
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
    return configuration.update(key, updatedValue, target);
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
