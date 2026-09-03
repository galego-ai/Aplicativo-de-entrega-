const MAPS_FALLBACK = "CLICK_FOOD_MAPS_KEY_NOT_CONFIGURED";

module.exports = ({ config }) => {
  const mapsApiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_ANDROID_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY ||
    MAPS_FALLBACK;

  return {
    ...config,
    android: {
      ...(config.android || {}),
      config: {
        ...(config.android?.config || {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps || {}),
          apiKey: mapsApiKey,
        },
      },
    },
  };
};
