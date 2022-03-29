const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const app = express();
const minimist = require('minimist');
const TOML = require("@iarna/toml");

const { match, rewrite, substitute } = require("./js/comby.js");

var DEBUG = false;

/** Generation parameters */
var TEMPLATES_DIR = "./templates";
var FRAGMENTS_DIR = "./fragments";
var TEMPLATES = [];
var FRAGMENTS = [];
var GENERATE_PROBABILITY = 0.0;
var TRANSFORM_GENERATED_PROBABILITY = 0.0;

/** Transformation parameters */
var MAX_TRANSFORMATION_RETRIES = 16;

/** Transformation rules */
var RULES_DIR = "./rules";
var RULES = [];

/** Load fragments and templates in memory */
var LOAD_IN_MEMORY = false;
var TEMPLATES_IN_MEMORY = [];
var FRAGMENTS_IN_MEMORY = [];

app.use(bodyParser.text());
app.use(bodyParser.urlencoded({ extended: false })); // support encoded bodies

function loadRules() {
  try {
    var ruleFiles = fs.readdirSync(RULES_DIR);
    ruleFiles.forEach(file => {
      content = fs.readFileSync(`${RULES_DIR}/${file}`, "utf8");
      toml = TOML.parse(content);
      for (const [_, value] of Object.entries(toml)) {
        RULES.push(value);
      }
    });
    console.log(`[+] Loaded ${RULES.length} transformation rules`);
  } catch (_) {
    return;
  }
}

function createDirs() {
  if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR);
  }
  if (!fs.existsSync(FRAGMENTS_DIR)) {
    fs.mkdirSync(FRAGMENTS_DIR);
  }
}

function replaceRange(source, { start, end }, replacement_text) {
  var before = source.slice(0, start.offset);
  var after = source.slice(end.offset, source.length);
  return before + replacement_text + after;
}

/**
 * randomly select concrete fragments to populate environment, e.g.,
 *
 * [{"variable":"1","value":"hole_1"},{"variable":"2","value":"hole_2"}]
 *
 * TODO: infer number of holes?
 */
function generateEnvironment() {
  var holes = 10;
  var environment = [];
  var i;
  for (i = 1; i < holes + 1; i++) {
    let fragment;
    if (LOAD_IN_MEMORY) {
      fragment = FRAGMENTS_IN_MEMORY[Math.floor(Math.random() * FRAGMENTS_IN_MEMORY.length)];
    } else {
      var fragmentName = FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)];
      fragment = fs.readFileSync(`${FRAGMENTS_DIR}/${fragmentName}`, "utf8");
    }

    environment.push({ variable: i.toString(), value: fragment });
  }
  return environment;
}

// randomly select a template, generate an environment, and substitute
function generateSource() {
  let template
  if (LOAD_IN_MEMORY) {
    template = TEMPLATES_IN_MEMORY[Math.floor(Math.random() * TEMPLATES_IN_MEMORY.length)];
  } else {
    var templateName = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
    template = fs.readFileSync(`${TEMPLATES_DIR}/${templateName}`, "utf8");
  }

  var environment = generateEnvironment();
  if (DEBUG) {
    console.log("template: ", template);
    console.log("------------------------------------------");
    console.log("environment: ", JSON.stringify(environment, null, 2));
    console.log("~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~");
  }
  return substitute(template, JSON.stringify(environment));
}

function transformSource(source) {
  if (DEBUG) {
    console.log("transforming: ", source);
  }

  let matches = [];
  var i;

  for (i = 0; i < MAX_TRANSFORMATION_RETRIES; i++) {
    var mutation = RULES[Math.floor(Math.random() * RULES.length)];
    if (DEBUG) {
      console.log("picked mutation: ", mutation);
    }

    try {
      var unparsed = match(source, mutation.match, ".go", "where true");
    } catch (err) {
      // Suppress bizarre Invalid_argument issue.
      if (DEBUG) {
        console.log("bizarre error: ", err);
      }
      continue;
    }
    matches = JSON.parse(unparsed);
    if (matches.length > 0) {
      if (DEBUG) {
        console.log("success mutation: ", mutation);
      }
      break;
    }
    if (DEBUG) {
      console.log("retrying transformation");
    }
  }

  if (matches.length > 0) {
    var index = Math.floor(Math.random() * matches.length);
    var m = matches[index];
    var substituted = substitute(
      mutation.rewrite,
      JSON.stringify(m.environment)
    );
    var result = replaceRange(source, m.range, substituted);
    if (DEBUG) {
      console.log("picked mutation: ", mutation);
      console.log("has matches: ", matches);
      console.log("environment: ", JSON.stringify(m.environment));
      console.log("substituted for mutation: ", substituted);
      console.log("result: ", result);
    }
    return result;
  }

  if (DEBUG) {
    console.log("no mutation with matches");
  }
  return "";
}

function mutate(source) {
  if (Math.random() < GENERATE_PROBABILITY) {
    if (DEBUG) {
      console.log("generating... ");
    }
    var source = generateSource();
    if (DEBUG) {
      console.log("generated: ", source);
    }
    if (Math.random() < TRANSFORM_GENERATED_PROBABILITY) {
      if (DEBUG) {
        console.log("and transforming...");
      }
      var transformed = transformSource(source);
      if (transformed !== "") {
        return transformed;
      }
    }
    return source;
  } else {
    if (DEBUG) {
      console.log("transforming... ");
    }
    return transformSource(source);
  }
}

app.post("/mutate", function(req, res) {
  res.send(mutate(req.body));
});

/** Debug endpoints. */

/**
 * Example invocation:
 *
 * curl -d '' -H "Content-Type: text/plain" -X POST http://localhost:4448/generate_debug
 */
app.post("/generate_debug", function(_, res) {
  DEBUG = true;
  console.log(
    "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
  );
  res.send(generateSource());
  DEBUG = false;
});

/**
 * Example invocation:
 *
 * curl -d '{1} {2} {3} [a] [b] (*) (&) (%, $)' -H "Content-Type: text/plain" -X POST http://localhost:4448/transform_debug
 */
app.post("/transform_debug", function(req, res) {
  DEBUG = true;
  console.log(
    "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
  );
  res.send(transformSource(req.body));
  DEBUG = false;
});

app.post("/mutate_debug", function(req, res) {
  DEBUG = true;
  console.log(
    "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-"
  );
  res.send(mutate(req.body));
  DEBUG = false;
});

/** Unused currently */
app.post("/rewrite_debug", bodyParser.json, function(req, res) {
  var mutation = RULES[Math.floor(Math.random() * RULES.length)];
  var result = rewrite(
    req.body.source,
    req.body.match,
    req.body.rewrite,
    ".go",
    "where true"
  );
  // console.log('Result: ', result);
  res.send(result);
});

let args = minimist(process.argv.slice(2), {
    default: {
        port: 4448,
        debug: DEBUG,
        generate: GENERATE_PROBABILITY,
        transform: TRANSFORM_GENERATED_PROBABILITY,
        templates: TEMPLATES_DIR,
        fragments: FRAGMENTS_DIR,
        memory: LOAD_IN_MEMORY,
        retries: MAX_TRANSFORMATION_RETRIES,
    },
});

var server = app.listen(args.port, function() {
  if (process.argv[2] == '--help' || process.argv[2] == '-h' || process.argv[2] == '-help') {
    console.log('Arg defaults: ', args)
    process.exit(1)
  }

  DEBUG = args.debug;
  GENERATE_PROBABILITY = args.generate;
  TRANSFORM_GENERATED_PROBABILITY = args.transform
  TEMPLATES_DIR = args.templates;
  FRAGMENTS_DIR = args.fragments;
  LOAD_IN_MEMORY = args.memory;
  MAX_TRANSFORMATION_RETRIES = args.retries;

  if (DEBUG) {
    console.log('[*] Args: ', args)
  }

  var host = server.address().address;
  var port = server.address().port;

  createDirs();

  TEMPLATES = fs.readdirSync(TEMPLATES_DIR);
  FRAGMENTS = fs.readdirSync(FRAGMENTS_DIR);

  if (LOAD_IN_MEMORY) {
    TEMPLATES.forEach(file =>
      { TEMPLATES_IN_MEMORY.push(fs.readFileSync(`${TEMPLATES_DIR}/${file}`, "utf8")) }
    )
    FRAGMENTS.forEach(file =>
      { FRAGMENTS_IN_MEMORY.push(fs.readFileSync(`${FRAGMENTS_DIR}/${file}`, "utf8")) }
    )
  }

  loadRules();

  console.log("[+] Mutation server listening at http://%s:%s", host, port);
});
