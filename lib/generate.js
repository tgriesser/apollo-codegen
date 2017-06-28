"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const loading_1 = require("./loading");
const validation_1 = require("./validation");
const compilation_1 = require("./compilation");
const serializeToJSON_1 = require("./serializeToJSON");
const swift_1 = require("./swift");
const typescript_1 = require("./typescript");
const flow_1 = require("./flow");
function generate(inputPaths, schemaPath, outputPath, target, tagName, options) {
    const schema = loading_1.loadSchema(schemaPath);
    const document = loading_1.loadAndMergeQueryDocuments(inputPaths, tagName);
    validation_1.validateQueryDocument(schema, document, target);
    if (target === 'swift') {
        options.addTypename = true;
    }
    options.mergeInFieldsFromFragmentSpreads = true;
    const context = compilation_1.compileToIR(schema, document, options);
    Object.assign(context, options);
    let output = '';
    switch (target) {
        case 'json':
            output = serializeToJSON_1.default(context);
            break;
        case 'ts':
        case 'typescript':
            output = typescript_1.generateSource(context);
            break;
        case 'flow':
            output = flow_1.generateSource(context);
            break;
        case 'swift':
            output = swift_1.generateSource(context, options);
            break;
    }
    if (outputPath) {
        fs.writeFileSync(outputPath, output);
    }
    else {
        console.log(output);
    }
}
exports.default = generate;
//# sourceMappingURL=generate.js.map