"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const fetch = require("node-fetch");
const fs = require("fs");
const https = require("https");
const utilities_1 = require("graphql/utilities");
const errors_1 = require("./errors");
const defaultHeaders = {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
};
function downloadSchema(url, outputPath, additionalHeaders, insecure) {
    return __awaiter(this, void 0, void 0, function* () {
        const headers = Object.assign(defaultHeaders, additionalHeaders);
        const agent = insecure ? new https.Agent({ rejectUnauthorized: false }) : null;
        let result;
        try {
            const response = yield fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ 'query': utilities_1.introspectionQuery }),
                agent,
            });
            result = yield response.json();
        }
        catch (error) {
            throw new errors_1.ToolError(`Error while fetching introspection query result: ${error.message}`);
        }
        if (result.errors) {
            throw new errors_1.ToolError(`Errors in introspection query result: ${result.errors}`);
        }
        const schemaData = result;
        if (!schemaData.data) {
            throw new errors_1.ToolError(`No introspection query result data found, server responded with: ${JSON.stringify(result)}`);
        }
        fs.writeFileSync(outputPath, JSON.stringify(schemaData, null, 2));
    });
}
exports.default = downloadSchema;
//# sourceMappingURL=downloadSchema.js.map