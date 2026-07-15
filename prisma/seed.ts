import { prisma } from "../src/libs/prisma";

const killerImageNames = [
  "the_animatronic",
  "the_artist",
  "the_blight",
  "the_cannibal",
  "the_cenobite",
  "the_clown",
  "the_dark_lord",
  "the_deathslinger",
  "the_demogorgon",
  "the_doctor",
  "the_dredge",
  "the_executioner",
  "the_ghost_face",
  "the_ghoul",
  "the_good_guy",
  "the_hag",
  "the_hillbilly",
  "the_houndmaster",
  "the_huntress",
  "the_knight",
  "the_krasue",
  "the_legion",
  "the_lich",
  "the_mastermind",
  "the_nemesis",
  "the_nightmare",
  "the_nurse",
  "the_oni",
  "the_onryo",
  "the_pig",
  "the_plague",
  "the_shape",
  "the_singularity",
  "the_skull_merchant",
  "the_spirit",
  "the_trapper",
  "the_trickster",
  "the_twins",
  "the_unknown",
  "the_wraith",
  "the_xenomorph",
];

const toKebabCase = (name: string) => name.replace(/_/g, "-");

const toTitleCase = (name: string) =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const killers = killerImageNames.map((imageName) => ({
  slug: toKebabCase(imageName),
  title: toTitleCase(imageName),
  image_url: `https://cdn.trailblazer.bz/dbd/killers/${imageName}.png`,
}));

const widgetTypes = [
  {
    slug: "first-word",
    display_name: "Greeting Message",
    description: "ตอบกลับผู้ใช้งานที่แชทเข้ามาครั้งแรกในสตรีมของคุณโดยอัตโนมัติ",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/first-word.png",
    theme_color: "#3b82f6",
    href: "/dashboard/widgets/first-word",
    is_active: true,
  },
  {
    slug: "clip-shoutout",
    display_name: "Clip Shoutout",
    description: "โปรโมทเพื่อนสตรีมเมอร์ที่มา Raid ด้วยการโชว์คลิปล่าสุดของอัตโนมัติ",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/clip-shoutout.png",
    theme_color: "#f97316",
    href: "/dashboard/widgets/clip-shoutout",
    is_active: true,
  },
  {
    slug: "random-dbd-perk",
    display_name: "Random DBD Perk",
    description: "สุ่ม Perk Dead by Daylight สำหรับ Survivor และ Killer ผ่านการแลกแต้มช่อง หรือคำสั่งแชท",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/random-dbd-perk.png",
    theme_color: "#10b981",
    href: "/dashboard/widgets/random-dbd-perk",
    is_active: true,
  },
  {
    slug: "random-dbd-killer",
    display_name: "Random DBD Killer",
    description: "สุ่มตัว Killer จาก Dead by Daylight ที่คุณกำหนดไว้ ผ่านการแลกแต้มช่อง",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/random-dbd-killer.png",
    theme_color: "#f43f5e",
    href: "/dashboard/widgets/random-dbd-killer",
    is_active: true,
  },
  {
    slug: "drop-image",
    display_name: "Drop Image",
    description: "ให้ผู้ชมของคุณโชว์รูปภาพบนหน้าจอผ่านการแลกแต้มช่อง",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/drop-image.png",
    theme_color: "#a855f7",
    href: "/dashboard/widgets/drop-image",
    is_active: true,
  },
  {
    slug: "export-video",
    display_name: "Auto Export to YouTube",
    description: "ส่งออกวิดีโอ (VOD) จาก Twitch ไปยัง YouTube โดยอัตโนมัติเมื่อคุณสตรีมจบ",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/export-video.png",
    theme_color: "#ef4444",
    href: "/dashboard/widgets/export-video",
    is_active: true,
  },
  {
    slug: "spotify-song-request",
    display_name: "Spotify Music Request",
    description: "ให้ผู้ชมของคุณขอเพลง Spotify ผ่านการแลกแต้มช่อง บอทจะเพิ่มเพลงเข้าคิวและตอบกลับในแชท",
    cost: 1,
    icon_url: "https://cdn.trailblazer.bz/widgets/spotify-song-request.png",
    theme_color: "#22c55e",
    href: "/dashboard/widgets/spotify-song-request",
    is_active: false,
  },
];

async function main() {
  for (const killer of killers) {
    await prisma.dBDKillerMaster.upsert({
      where: { slug: killer.slug },
      update: killer,
      create: killer,
    });
  }

  for (const widgetType of widgetTypes) {
    await prisma.widgetType.upsert({
      where: { slug: widgetType.slug },
      update: widgetType,
      create: widgetType,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
