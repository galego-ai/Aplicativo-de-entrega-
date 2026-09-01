const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const appNodeModules = path.resolve(projectRoot, 'node_modules');
const rootNodeModules = path.resolve(projectRoot, '../../node_modules');
const config = getDefaultConfig(projectRoot);

// Metro usa primeiro o React 19.2.3 do Entregador. O node_modules raiz fica
// disponível apenas para Expo/React Native e dependências hoistadas do monorepo.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [appNodeModules, rootNodeModules];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(appNodeModules, 'react'),
};

module.exports = config;
