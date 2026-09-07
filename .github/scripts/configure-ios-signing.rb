# frozen_string_literal: true

require 'xcodeproj'

project_path = ARGV.fetch(0)
team_id = ENV.fetch('APPLE_TEAM_ID')

profiles = {
  'TimeFlower' => {
    name: ENV.fetch('APPLE_APP_PROFILE_NAME'),
    uuid: ENV.fetch('APPLE_APP_PROFILE_UUID')
  },
  'ExpoWidgetsTarget' => {
    name: ENV.fetch('APPLE_WIDGET_PROFILE_NAME'),
    uuid: ENV.fetch('APPLE_WIDGET_PROFILE_UUID')
  }
}

project = Xcodeproj::Project.open(project_path)
targets_by_name = {}
project.targets.each { |target| targets_by_name[target.name] = target }
missing_targets = profiles.keys.reject { |name| targets_by_name.key?(name) }

unless missing_targets.empty?
  abort "Missing release target(s): #{missing_targets.join(', ')}. Found: #{targets_by_name.keys.join(', ')}"
end

profiles.each do |target_name, profile|
  target = targets_by_name.fetch(target_name)
  release = target.build_configurations.find { |configuration| configuration.name == 'Release' }
  abort "#{target_name} has no Release configuration" unless release

  settings = release.build_settings
  settings['DEVELOPMENT_TEAM'] = team_id
  settings['CODE_SIGN_STYLE'] = 'Manual'
  settings['CODE_SIGN_IDENTITY'] = 'Apple Distribution'
  settings['CODE_SIGN_IDENTITY[sdk=iphoneos*]'] = 'Apple Distribution'
  settings['PROVISIONING_PROFILE'] = profile.fetch(:uuid)
  settings['PROVISIONING_PROFILE[sdk=iphoneos*]'] = profile.fetch(:uuid)
  settings['PROVISIONING_PROFILE_SPECIFIER'] = profile.fetch(:name)
  settings['PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]'] = profile.fetch(:name)
end

project.save
puts "Configured manual App Store signing for #{profiles.keys.join(' and ')}"
