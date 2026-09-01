const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const appNodeModules = path.resolve(projectRoot, 'node_modules');
const rootNodeModules = path.resolve(projectRoot, '../../node_modules');
const config = getDefaultConfig(projectRoot);

// O monorepo tem painéis Next.js com outra versão de React. Metro procura
// primeiro no workspace móvel (React 19.2.3) e só depois usa o node_modules
// raiz para Expo/React Native e dependências compartilhadas que o npm hoistou.
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [appNodeModules, rootNodeModules];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  react: path.resolve(appNodeModules, 'react'),
};

module.exports = config;
