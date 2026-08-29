import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://rmlbmacoqnynqdqmxecz.supabase.co";
const supabasePublishableKey = "sb_publishable_OUOdXnZuii86fJw_vIKauw__fqwdx4q";

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});