const { version } = require("./package.json");
const [ major, minor, patch ] = version.split(".").map(v => parseInt(v));

module.exports = { version, major, minor, patch };
