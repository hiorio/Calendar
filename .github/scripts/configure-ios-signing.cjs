'use strict';

const fs = require('node:fs');
const { IOSConfig } = require('@expo/config-plugins');

const projectRoot = process.argv[2];
if (!projectRoot) {
  throw new Error('Usage: node configure-ios-signing.cjs <ios-project-root>');
}

const requiredEnvironment = [
  'APPLE_TEAM_ID',
  'APPLE_SIGNING_IDENTITY',
  'APPLE_APP_PROFILE_NAME',
  'APPLE_APP_PROFILE_UUID',
  'APPLE_WIDGET_PROFILE_NAME',
  'APPLE_WIDGET_PROFILE_UUID',
];

for (const name of requiredEnvironment) {
  if (!process.env[name]) {
    throw new Error(`Missing required release value: ${name}`);
  }
}

const quote = (value) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
const project = IOSConfig.XcodeUtils.getPbxproj(projectRoot);
const profiles = {
  TimeFlower: {
    name: process.env.APPLE_APP_PROFILE_NAME,
    uuid: process.env.APPLE_APP_PROFILE_UUID,
  },
  ExpoWidgetsTarget: {
    name: process.env.APPLE_WIDGET_PROFILE_NAME,
    uuid: process.env.APPLE_WIDGET_PROFILE_UUID,
  },
};

const nativeTargets = new Map(
  IOSConfig.Target.getNativeTargets(project).map(([id, target]) => [
    IOSConfig.XcodeUtils.unquote(target.name),
    [id, target],
  ])
);
const missingTargets = Object.keys(profiles).filter((name) => !nativeTargets.has(name));

if (missingTargets.length > 0) {
  throw new Error(
    `Missing release target(s): ${missingTargets.join(', ')}. Found: ${[
      ...nativeTargets.keys(),
    ].join(', ')}`
  );
}

for (const [targetName, profile] of Object.entries(profiles)) {
  const [targetId, target] = nativeTargets.get(targetName);
  const releaseConfigurations = IOSConfig.XcodeUtils.getBuildConfigurationsForListId(
    project,
    target.buildConfigurationList
  ).filter(([, configuration]) => IOSConfig.XcodeUtils.unquote(configuration.name) === 'Release');

  if (releaseConfigurations.length === 0) {
    throw new Error(`${targetName} has no Release configuration`);
  }

  for (const [, configuration] of releaseConfigurations) {
    const settings = configuration.buildSettings;
    settings.DEVELOPMENT_TEAM = quote(process.env.APPLE_TEAM_ID);
    settings.CODE_SIGN_STYLE = 'Manual';
    settings.CODE_SIGN_IDENTITY = quote(process.env.APPLE_SIGNING_IDENTITY);
    settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = quote(process.env.APPLE_SIGNING_IDENTITY);
    settings.PROVISIONING_PROFILE = quote(profile.uuid);
    settings['PROVISIONING_PROFILE[sdk=iphoneos*]'] = quote(profile.uuid);
    settings.PROVISIONING_PROFILE_SPECIFIER = quote(profile.name);
    settings['PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]'] = quote(profile.name);
  }

  for (const [, projectSection] of Object.entries(IOSConfig.XcodeUtils.getProjectSection(project)).filter(
    IOSConfig.XcodeUtils.isNotComment
  )) {
    projectSection.attributes ??= {};
    projectSection.attributes.TargetAttributes ??= {};
    projectSection.attributes.TargetAttributes[targetId] ??= {};
    projectSection.attributes.TargetAttributes[targetId].DevelopmentTeam = quote(
      process.env.APPLE_TEAM_ID
    );
    projectSection.attributes.TargetAttributes[targetId].ProvisioningStyle = 'Manual';
  }
}

fs.writeFileSync(project.filepath, project.writeSync());
console.log(`Configured manual App Store signing for ${Object.keys(profiles).join(' and ')}`);
