"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const printing_1 = require("../utilities/printing");
function comment(generator, comment) {
    comment && comment.split('\n')
        .forEach(line => {
        generator.printOnNewline(`/// ${line.trim()}`);
    });
}
exports.comment = comment;
function namespaceDeclaration(generator, namespace, closure) {
    if (namespace) {
        generator.printNewlineIfNeeded();
        generator.printOnNewline(`/// ${namespace} namespace`);
        generator.printOnNewline(`public enum ${namespace}`);
        generator.pushScope({ typeName: namespace });
        generator.withinBlock(closure);
        generator.popScope();
    }
    else {
        closure();
    }
}
exports.namespaceDeclaration = namespaceDeclaration;
function classDeclaration(generator, { className, modifiers, superClass, adoptedProtocols = [], properties }, closure) {
    generator.printNewlineIfNeeded();
    generator.printOnNewline(printing_1.wrap('', printing_1.join(modifiers, ' '), ' ') + `class ${className}`);
    generator.print(printing_1.wrap(': ', printing_1.join([superClass, ...adoptedProtocols], ', ')));
    generator.pushScope({ typeName: className });
    generator.withinBlock(closure);
    generator.popScope();
}
exports.classDeclaration = classDeclaration;
function structDeclaration(generator, { structName, description, adoptedProtocols = [] }, closure) {
    generator.printNewlineIfNeeded();
    comment(generator, description);
    generator.printOnNewline(`public struct ${structName}`);
    generator.print(printing_1.wrap(': ', printing_1.join(adoptedProtocols, ', ')));
    generator.pushScope({ typeName: structName });
    generator.withinBlock(closure);
    generator.popScope();
}
exports.structDeclaration = structDeclaration;
function propertyDeclaration(generator, { propertyName, typeName, description }) {
    comment(generator, description);
    generator.printOnNewline(`public var ${propertyName}: ${typeName}`);
}
exports.propertyDeclaration = propertyDeclaration;
function propertyDeclarations(generator, properties) {
    if (!properties)
        return;
    properties.forEach(property => propertyDeclaration(generator, property));
}
exports.propertyDeclarations = propertyDeclarations;
function protocolDeclaration(generator, { protocolName, adoptedProtocols, properties }, closure) {
    generator.printNewlineIfNeeded();
    generator.printOnNewline(`public protocol ${protocolName}`);
    generator.print(printing_1.wrap(': ', printing_1.join(adoptedProtocols, ', ')));
    generator.pushScope({ typeName: protocolName });
    generator.withinBlock(closure);
    generator.popScope();
}
exports.protocolDeclaration = protocolDeclaration;
function protocolPropertyDeclaration(generator, { propertyName, typeName }) {
    generator.printOnNewline(`var ${propertyName}: ${typeName} { get }`);
}
exports.protocolPropertyDeclaration = protocolPropertyDeclaration;
function protocolPropertyDeclarations(generator, properties) {
    if (!properties)
        return;
    properties.forEach(property => protocolPropertyDeclaration(generator, property));
}
exports.protocolPropertyDeclarations = protocolPropertyDeclarations;
const reservedKeywords = new Set(['associatedtype', 'class', 'deinit', 'enum', 'extension',
    'fileprivate', 'func', 'import', 'init', 'inout', 'internal', 'let', 'open',
    'operator', 'private', 'protocol', 'public', 'static', 'struct', 'subscript',
    'typealias', 'var', 'break', 'case', 'continue', 'default', 'defer', 'do',
    'else', 'fallthrough', 'for', 'guard', 'if', 'in', 'repeat', 'return',
    'switch', 'where', 'while', 'as', 'Any', 'catch', 'false', 'is', 'nil',
    'rethrows', 'super', 'self', 'Self', 'throw', 'throws', 'true', 'try',
    'associativity', 'convenience', 'dynamic', 'didSet', 'final', 'get', 'infix',
    'indirect', 'lazy', 'left', 'mutating', 'none', 'nonmutating', 'optional',
    'override', 'postfix', 'precedence', 'prefix', 'Protocol', 'required', 'right',
    'set', 'Type', 'unowned', 'weak', 'willSet']);
function escapeIdentifierIfNeeded(identifier) {
    if (reservedKeywords.has(identifier)) {
        return '`' + identifier + '`';
    }
    else {
        return identifier;
    }
}
exports.escapeIdentifierIfNeeded = escapeIdentifierIfNeeded;
//# sourceMappingURL=language.js.map