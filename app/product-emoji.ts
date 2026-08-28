const normalizeProductText = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

export function productEmoji(name: string, category = "", storedEmoji?: string | null) {
  if (storedEmoji && storedEmoji !== "📦" && storedEmoji !== "🛍️") return storedEmoji;
  const text = normalizeProductText(`${name} ${category}`);
  if (text.includes("huevo")) return "🥚";
  if (text.includes("ques") || text.includes("muz")) return "🧀";
  if (text.includes("pollo") || text.includes("pechuga")) return "🍗";
  if (text.includes("carne") || text.includes("vacio") || text.includes("asado")) return "🥩";
  if (text.includes("pescado") || text.includes("atun")) return "🐟";
  if (text.includes("aceitun") || text.includes("oliva")) return "🫒";
  if (text.includes("miel")) return "🍯";
  if (text.includes("mermelada") || text.includes("dulce")) return "🍓";
  if (text.includes("yerba") || text.includes("mate")) return "🧉";
  if (text.includes("ajo")) return "🧄";
  if (text.includes("cebolla")) return "🧅";
  if (text.includes("berenjena")) return "🍆";
  if (text.includes("pepino")) return "🥒";
  if (text.includes("poroto") || text.includes("hummus")) return "🫘";
  if (text.includes("aji") || text.includes("pimiento") || text.includes("salsa") || text.includes("kimchi")) return "🌶️";
  if (text.includes("alcaucil") || text.includes("esparrago") || text.includes("hortaliza") || text.includes("coliflor") || text.includes("chucrut")) return "🥬";
  if (text.includes("pasta") || text.includes("crema") || text.includes("pure") || text.includes("conserva") || text.includes("pickle")) return "🫙";
  if (text.includes("pan") || text.includes("gallet") || text.includes("tostada")) return "🥖";
  if (text.includes("harina") || text.includes("cereal") || text.includes("avena")) return "🌾";
  if (text.includes("cafe")) return "☕";
  if (text.includes("vino")) return "🍷";
  if (text.includes("cerveza")) return "🍺";
  if (text.includes("agua") || text.includes("jugo") || text.includes("gaseosa") || text.includes("bebida")) return "🥤";
  if (text.includes("mascota") || text.includes("perro") || text.includes("gato") || text.includes("pet")) return "🐾";
  if (text.includes("limpieza") || text.includes("jabon") || text.includes("detergente")) return "🧼";
  return "🛍️";
}
