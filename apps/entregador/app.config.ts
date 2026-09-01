import type { ConfigContext, ExpoConfig } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY?.trim();
  const plugins: NonNullable<ExpoConfig["plugins"]> = [...(config.plugins ?? [])];

  if (googleMapsApiKey) {
    plugins.push([
      "react-native-maps",
      { androidGoogleMapsApiKey: googleMapsApiKey },
    ]);
  }

  return {
    ...config,
    plugins,
  };
};
