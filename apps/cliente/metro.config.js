const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const appNodeModules = path.resolve(projectRoot, 'node_modules');
const config = getDefaultConfig(projectRoot);

// Este monorepo também contém painéis Next.js que usam outra versão de React.
// O app React Native deve resolver exclusivamente os módulos nativos do próprio
// workspace para nunca empacotar duas instâncias de React no APK.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [appNodeModules];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(appNodeModules, 'react'),
  'react-native': path.resolve(appNodeModules, 'react-native'),
};

module.exports = config;
