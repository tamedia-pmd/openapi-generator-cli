const { exec } = require("child_process");
const https = require("https");
const path = require("path");

const fs = require("fs-extra");

const packageInfo = require("../package.json");
const registry = "https://tamediapmd.jfrog.io/tamediapmd/api/npm/cloud-npm/";
const tagPrefix = "cli-";

async function httpGET(url) {
  return new Promise((resolve, reject) => {
    https
      .get(
        url,
        {
          auth: `${process.env.JFROG_USERNAME}:${process.env.JFROG_PASSWORD}`
        },
        resp => {
          let data = "";
          resp.on("data", chunk => (data += chunk));
          resp.on("end", () => resolve(data));
        }
      )
      .on("error", reject);
  });
}

async function getOpenapiGeneratorCliDownloadLink() {
  const baseUrl = "https://tamediapmd.jfrog.io/tamediapmd";
  const queryUrl = `${baseUrl}/api/search/latestVersion?g=org.openapitools&a=openapi-generator&v=*`;

  return httpGET(queryUrl).then(data => {
    const version = data.split("-")[0];
    return {
      downloadLink: `${baseUrl}/tools/org/openapitools/openapi-generator/${version}-SNAPSHOT/openapi-generator-${data}.jar`,
      version
    };
  });
}

async function getAlreadyPublishedVersion() {
  return new Promise((resolve, reject) => {
    exec(
      `npm view ${packageInfo.name} --registry ${registry} --json`,
      (error, stdout) => {
        if (error !== null) {
          reject(error);
          return;
        }

        try {
          const json = JSON.parse(stdout);
          resolve(
            Object.keys(json["dist-tags"]).map(tag => {
              return tag.replace(tagPrefix, "");
            })
          );
        } catch (e) {
          reject(e);
        }
      }
    );
  });
}

async function downloadFile(downloadLink, savePath) {
  await fs.ensureDir(path.dirname(savePath));

  return new Promise(resolve => {
    const file = fs.createWriteStream(savePath);
    https.get(downloadLink, response => {
      response.pipe(file);
      response.on("end", () => {
        resolve();
      });
    });
  });
}

async function buildPackage(
  openapiGeneratorCliVersion,
  openapiGeneratorCliDownloadLink
) {
  console.log(
    `Build package for openapi-generator-cli@${openapiGeneratorCliVersion}`
  );

  const packageDistDir = path.resolve("./dist", openapiGeneratorCliVersion);

  // download the java binary
  await downloadFile(
    openapiGeneratorCliDownloadLink,
    path.resolve(packageDistDir, "bin/openapi-generator.jar")
  );

  // copy all files which are listen in the package.json (files property) to package dist directory
  packageInfo.files
    .filter(file => !file.endsWith("openapi-generator.jar"))
    .forEach(
      async file =>
        await fs.copy(path.resolve(file), path.resolve(packageDistDir, file))
    );

  // build the package json file based on the main package.json
  const {
    scripts,
    dependencies,
    devDependencies,
    ...packageJsonDefault
  } = packageInfo;
  await fs.outputJson(path.resolve(packageDistDir, "package.json"), {
    ...packageJsonDefault,
    version: `${packageInfo.version}-${openapiGeneratorCliVersion}`
  });
}

module.exports = {
  config: {
    registry,
    tagPrefix
  },
  getOpenapiGeneratorCliDownloadLink,
  getAlreadyPublishedVersion,
  buildPackage
};
