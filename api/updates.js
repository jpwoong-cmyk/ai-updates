import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from("updates")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(40);

  if (error) return res.status(500).json({ error: error.message });

  const grouped = {
    openai: [],
    gemini: [],
    claude: [],
    deepseek: []
  };

  data.forEach(item => {
    if (grouped[item.source_slug]) {
      grouped[item.source_slug].push(item);
    }
  });

  res.status(200).json(grouped);
}