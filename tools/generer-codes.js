/* =========================================================
   Génère des codes de déblocage et leurs empreintes SHA-256.
   Usage : node tools/generer-codes.js [nombre]

   Les CODES sont à garder secrets (à remettre aux clients qui
   paient). Seules les EMPREINTES vont dans js/licence.js :
   elles ne permettent pas de retrouver les codes.
   ========================================================= */
const crypto = require("crypto");

const NOMBRE = Math.max(1, Number(process.argv[2]) || 10);
// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

console.log("CODE (secret, pour vos clients)     EMPREINTE (à coller dans js/licence.js)");
console.log("-".repeat(100));

for (let i = 0; i < NOMBRE; i++) {
  let brut = "";
  for (let j = 0; j < 10; j++) brut += ALPHABET[crypto.randomInt(ALPHABET.length)];
  const code = "ATEL-" + brut.slice(0, 5) + "-" + brut.slice(5);
  const canonique = code.replace(/[^A-Z0-9]/g, "");
  const empreinte = crypto.createHash("sha256").update(canonique).digest("hex");
  console.log(code + "   " + empreinte);
}
