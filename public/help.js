'use strict';

// Public, local guide. Opening it never calls a service or changes a setting.
function renderCompanionHelp({ container, node, navigate }) {
  const guide = node('div', 'help-guide');
  const paragraph = text => node('p', '', text);
  function list(parent, items, ordered = false) {
    const result = node(ordered ? 'ol' : 'ul', 'help-list');
    for (const text of items) result.append(node('li', '', text));
    parent.append(result);
  }
  function shortcut(parent, label, page, target) {
    const button = node('button', 'file-action help-settings-link', label);
    button.type = 'button';
    button.dataset.helpPage = page;
    button.dataset.helpTarget = target;
    button.addEventListener('click', () => navigate(page, target));
    parent.append(button);
  }
  function section(id, title, open = false) {
    const details = node('details', 'help-section');
    details.id = id.replace('help-', 'help-topic-');
    details.open = open;
    const summary = node('summary', '', title);
    summary.id = id;
    const body = node('div', 'help-section-body');
    details.append(summary, body);
    guide.append(details);
    return body;
  }

  guide.append(paragraph(BionicI18n.t('components.help.intro')));

  const start = section('help-start', BionicI18n.t('components.help.startTitle'), true);
  list(start, [
    BionicI18n.t('components.help.startPc'),
    BionicI18n.t('components.help.startProject'),
    BionicI18n.t('components.help.startModel')
  ], true);
  start.append(paragraph(BionicI18n.t('components.help.ownTools')));
  shortcut(start, BionicI18n.t('components.help.checkConnection'), 'maintenance', 'diagnostics-open');

  const chat = section('help-chat', BionicI18n.t('components.help.chatTitle'));
  chat.append(paragraph(BionicI18n.t('components.help.nativeHistory')));
  chat.append(paragraph(BionicI18n.t('components.help.branches')));
  chat.append(paragraph(BionicI18n.t('components.help.modelSettings')));
  chat.append(paragraph(BionicI18n.t('components.help.drafts')));
  shortcut(chat, BionicI18n.t('components.help.responseLength'), 'models', 'output-mode');
  shortcut(chat, BionicI18n.t('components.help.draftRetention'), 'reading', 'draft-duration');

  const files = section('help-files', BionicI18n.t('components.help.filesTitle'));
  files.append(paragraph(BionicI18n.t('components.help.importAttach')));
  files.append(paragraph(BionicI18n.t('components.help.supportedFiles')));
  files.append(paragraph(BionicI18n.t('components.help.projectFiles')));
  files.append(paragraph(BionicI18n.t('components.help.filePermissions')));
  shortcut(files, BionicI18n.t('components.help.checkPermissions'), 'tools', 'settings-edit-tools');

  const tools = section('help-tools', BionicI18n.t('components.help.toolsTitle'));
  tools.append(paragraph(BionicI18n.t('components.help.fixedPermissions')));
  tools.append(node('h3', '', BionicI18n.t('components.help.webTitle')));
  tools.append(paragraph(BionicI18n.t('components.help.webHelp')));
  tools.append(node('h3', '', BionicI18n.t('components.help.scriptTitle')));
  tools.append(paragraph(BionicI18n.t('components.help.scriptApproval')));
  tools.append(paragraph(BionicI18n.t('components.help.scriptPermissions')));
  shortcut(tools, BionicI18n.t('components.help.nextMessageTools'), 'tools', 'settings-edit-tools');

  const images = section('help-images', BionicI18n.t('components.help.imagesTitle'));
  list(images, [
    BionicI18n.t('components.help.comfyServer'),
    BionicI18n.t('components.help.comfyModels'),
    BionicI18n.t('components.help.comfyEnable')
  ], true);
  images.append(paragraph(BionicI18n.t('components.help.comfyWorkflows')));
  images.append(node('h3', '', BionicI18n.t('components.help.memoryTitle')));
  images.append(paragraph(BionicI18n.t('components.help.memoryBenefit')));
  images.append(paragraph(BionicI18n.t('components.help.memoryInstall')));
  images.append(paragraph(BionicI18n.t('components.help.memoryTiming')));
  for(const key of ['series','policy','actions'])images.append(paragraph(BionicI18n.t('components.beta25.help.'+key)));
  shortcut(images, BionicI18n.t('components.help.comfySettings'), 'images', 'comfy-discover');
  shortcut(images, BionicI18n.t('components.help.memorySettings'), 'images', 'comfy-memory-cleanup');

  const connection = section('help-connection', BionicI18n.t('components.help.connectionTitle'));
  connection.append(paragraph(BionicI18n.t('components.help.connectionHelp')));
  connection.append(node('h3', '', BionicI18n.t('components.beta24.help.httpsStepsTitle')));
  list(connection, [
    BionicI18n.t('components.beta24.help.httpsPrepare'),
    BionicI18n.t('components.beta24.help.httpsInstallAuthority'),
    BionicI18n.t('components.beta24.help.httpsVerify')
  ], true);
  connection.append(node('h3', '', BionicI18n.t('components.beta24.help.authorityInstallTitle')));
  list(connection, [
    BionicI18n.t('components.beta24.help.authorityAndroid'),
    BionicI18n.t('components.beta24.help.authorityIos'),
    BionicI18n.t('components.beta24.help.authorityWindows')
  ]);
  connection.append(paragraph(BionicI18n.t('components.beta24.help.certificateWarning')));
  connection.append(node('h3', '', BionicI18n.t('components.beta24.help.deviceCertificateTitle')));
  connection.append(paragraph(BionicI18n.t('components.beta24.help.deviceCertificate')));
  connection.append(paragraph(BionicI18n.t('components.help.sharedAccess')));
  shortcut(connection, BionicI18n.t('components.help.connectionSettings'), 'connection', 'certificate-title');

  const troubleshooting = section('help-troubleshooting', BionicI18n.t('components.help.troubleshootingTitle'));
  list(troubleshooting, [
    BionicI18n.t('components.help.modelProblem'),
    BionicI18n.t('components.help.toolProblem'),
    BionicI18n.t('components.help.serverProblem'),
    BionicI18n.t('components.help.imageProblem'),
    BionicI18n.t('components.help.fileProblem')
  ]);
  shortcut(troubleshooting, BionicI18n.t('components.help.connectionDiagnostics'), 'maintenance', 'diagnostics-open');
  shortcut(troubleshooting, BionicI18n.t('components.help.comfyTest'), 'images', 'comfy-test');

  const updates = section('help-updates', BionicI18n.t('components.help.updatesTitle'));
  updates.append(paragraph(BionicI18n.t('components.help.updatesHelp')));
  updates.append(paragraph(BionicI18n.t('components.help.stableReturn')));
  shortcut(updates, BionicI18n.t('components.help.updatesSettings'), 'maintenance', 'updates-title');

  container.replaceChildren(guide);
  const bindings = renderCompanionHelp.languageBindings || (renderCompanionHelp.languageBindings = new WeakMap());
  if (!bindings.has(container)) bindings.set(container, BionicI18n.onChange(() => {
    const expanded = new Map([...container.querySelectorAll('details.help-section')].map(section => [section.id, section.open]));
    const focused = container.contains(document.activeElement) ? document.activeElement : null;
    const focusId = focused?.id;
    const focusPage = focused?.dataset.helpPage, focusTarget = focused?.dataset.helpTarget;
    renderCompanionHelp({ container, node, navigate });
    for (const section of container.querySelectorAll('details.help-section')) if (expanded.has(section.id)) section.open = expanded.get(section.id);
    if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    else if (focusPage) [...container.querySelectorAll('.help-settings-link')].find(button => button.dataset.helpPage === focusPage && button.dataset.helpTarget === focusTarget)?.focus({ preventScroll: true });
  }));
}
