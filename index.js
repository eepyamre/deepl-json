require('./flatmap');
const commandLineArgs = require('command-line-args');
const path = require('path')
const fs = require('fs');
const { env } = require('process');
const deepl = require('deepl-node');

const optionDefinitions = [
  { name: 'input', alias: 'i', type: String },
  { name: 'output', alias: 'o', type: String },
  { name: 'source', alias: 's', type: String },
  { name: 'target', alias: 't', type: String },
  { name: 'key', alias: 'k', type: String },
  { name: 'formal', alias: 'f', type: Boolean },
  { name: 'properties', alias: 'p', type: Boolean },
  { name: 'debug', alias: 'd', type: Boolean },
  { name: 'usagelimit', alias: 'u', type: Boolean },
];

const options = commandLineArgs(optionDefinitions);

const authKey = options.key || env.DEEPL_API_KEY;
const inputFileName = options.input || getJsonFileInFolder();
let outputFileName = options.output;
const sourceLanguage = options.source;
const targetLanguage = options.target || 'FR';
const formality = options.formal ? 'prefer_more' : 'prefer_less';
const translateProperties = options.properties || false;
const logDebug = options.debug || false;
const displayUsageLimit = options.usagelimit;

if (!authKey) throw new Error('Specify a DeepL API key as DEEPL_API_KEY environment variable, or using the --key or -k parameter.')
if (!inputFileName) throw new Error('At least specify input file with --input or -i.');

if (!outputFileName) outputFileName = inputFileName.split('.').slice(0, -1).join('.') + '.' + targetLanguage.toLowerCase() + '.json';

log('Input file:', inputFileName);
log('Output file:', outputFileName);
log('Source language:', sourceLanguage || 'Auto detect');
log('Target language:', targetLanguage);
log('Formality:', formality);
log('Translate properties:', translateProperties);
log('Show debug:', logDebug);
log('Show usage limit:', displayUsageLimit);

const translator = new deepl.Translator(authKey);
const cache = {};

main(options).catch(console.error);

async function main() {
  log('Loading json file...');

  const allInputAsText = fs.readFileSync(inputFileName).toString();
  const inputObj = JSON.parse(allInputAsText);

  log('Translating...');

  const translatedObj = await translateJSON(inputObj);
  
  const outputAsText = JSON.stringify(translatedObj);

  fs.writeFileSync(outputFileName, outputAsText);

  if (displayUsageLimit) {
    console.log('Usage limit:');
    const usage = await translator.getUsage();
    if (usage.anyLimitReached()) {
        console.log('Translation limit exceeded.');
    }
    if (usage.character) {
        console.log(`Characters: ${usage.character.count} of ${usage.character.limit}`);
    }
    if (usage.document) {
        console.log(`Documents: ${usage.document.count} of ${usage.document.limit}`);
    }
  }
}

async function translate(text) {
  if (!text) return text;

  const safeText = text || '';
  const truncatedText = truncateString(safeText, 50);

  if (cache[text]) {
    debug('Entry found in cache, returning: ' + truncatedText)
    return cache[text];
  }
  
  debug('Translating: ' + truncatedText) 
  const response = await translator.translateText(text, sourceLanguage, targetLanguage, { formality });
  const translatedText = response.text;

  cache[text] = translatedText;

  return translatedText;
}

async function translateJSON(jsonObj) {
  if (Array.isArray(jsonObj)) {
    for (let i = 0; i < jsonObj.length; i++) {
      jsonObj[i] = await translateJSON(jsonObj[i]);
    }
    return jsonObj;
  } else if (typeof jsonObj === 'object' && jsonObj !== null) {
    let newObject = {};
    for (const key of Object.keys(jsonObj)) {
      const translatedKey = translateProperties ? await translate(key) : key;
      newObject[translatedKey] = await translateJSON(jsonObj[key]);
    }
    return newObject;
  } else if (typeof jsonObj === 'string') {
    return await translate(jsonObj);
  } else {
    return jsonObj;
  }
}

function getJsonFileInFolder() {
  const files = fs.readdirSync('.');
  for(let i = 0; i < files.length; i++){
    const filename = path.join(files[i]);
    var stat = fs.lstatSync(filename);
    if (!stat.isDirectory() && filename.indexOf('.json') >= 0) {
      return filename;
    };
  }
  return null;
}

function log(...args) {
  console.log(...args);
}

function debug(...args) {
  if (logDebug) console.log(...args);
}

function truncateString(str, num) {
  if (str.length > num) {
    return str.slice(0, num) + "...";
  } else {
    return str;
  }
}