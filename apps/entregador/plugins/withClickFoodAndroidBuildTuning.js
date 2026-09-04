const { withGradleProperties } = require('@expo/config-plugins');

function upsertProperty(properties, key, value) {
  const index = properties.findIndex((item) => item?.type === 'property' && item?.key === key);
  const entry = { type: 'property', key, value };
  if (index >= 0) properties[index] = entry;
  else properties.push(entry);
}

module.exports = function withClickFoodAndroidBuildTuning(config) {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;

    // O expo-updates/KSP ultrapassou o limite padrão de 512 MiB de Metaspace
    // no build local do GitHub. Gravar aqui garante que o valor seja aplicado
    // ao android/gradle.properties gerado pelo Expo prebuild.
    upsertProperty(properties, 'org.gradle.jvmargs', '-Xmx3g -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8');
    upsertProperty(properties, 'org.gradle.workers.max', '2');
    upsertProperty(properties, 'org.gradle.parallel', 'false');
    upsertProperty(properties, 'kotlin.compiler.execution.strategy', 'in-process');

    // APK de aparelho físico: evita gastar CPU/memória compilando ABIs de emulador.
    upsertProperty(properties, 'reactNativeArchitectures', 'arm64-v8a,armeabi-v7a');

    return config;
  });
};
