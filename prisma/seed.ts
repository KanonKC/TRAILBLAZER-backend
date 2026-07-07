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

async function main() {
  for (const killer of killers) {
    await prisma.dBDKillerMaster.upsert({
      where: { slug: killer.slug },
      update: killer,
      create: killer,
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
