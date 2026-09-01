import type { ConfigContext, ExpoConfig } from "expo/config";

const MAPS_FALLBACK_KEY = "CLICK_FOOD_MAPS_KEY_NOT_CONFIGURED";

export default ({ config }: ConfigContext): ExpoConfig => {
  const configuredGoogleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const googleMapsApiKey = configuredGoogleMapsApiKey || MAPS_FALLBACK_KEY;
  const plugins: NonNullable<ExpoConfig["plugins"]> = [...(config.plugins ?? [])];

  // react-native-maps on Android expects the native API-key metadata to exist.
  // Keeping the metadata present prevents a native startup/map crash when a CI
  // runner is missing the secret. A real key is still required to render tiles.
  plugins.push([
    "react-native-maps",
    { androidGoogleMapsApiKey: googleMapsApiKey },
  ]);

  return {
    ...config,
    name: config.name ?? "CLICK-FOOD Entregador",
    slug: config.slug ?? "click-food-entregador",
    plugins,
    extra: {
      ...(config.extra ?? {}),
      googleMapsConfigured: Boolean(configuredGoogleMapsApiKey),
    },
  };
};
