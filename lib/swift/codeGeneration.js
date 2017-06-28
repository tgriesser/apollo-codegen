"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const graphql_2 = require("../utilities/graphql");
const printing_1 = require("../utilities/printing");
const language_1 = require("./language");
const naming_1 = require("./naming");
const values_1 = require("./values");
const types_1 = require("./types");
const CodeGenerator_1 = require("../utilities/CodeGenerator");
function generateSource(context, options) {
    const generator = new CodeGenerator_1.default(context);
    generator.printOnNewline('//  This file was automatically generated and should not be edited.');
    generator.printNewline();
    generator.printOnNewline('import Apollo');
    language_1.namespaceDeclaration(generator, context.namespace, () => {
        context.typesUsed.forEach(type => {
            typeDeclarationForGraphQLType(generator, type);
        });
        Object.values(context.operations).forEach(operation => {
            classDeclarationForOperation(generator, operation);
        });
        Object.values(context.fragments).forEach(fragment => {
            structDeclarationForFragment(generator, fragment);
        });
    });
    return generator.output;
}
exports.generateSource = generateSource;
function classDeclarationForOperation(generator, { operationName, operationType, rootType, variables, fields, inlineFragments, fragmentSpreads, fragmentsReferenced, source, }) {
    let className;
    let protocol;
    switch (operationType) {
        case 'query':
            className = `${naming_1.operationClassName(operationName)}Query`;
            protocol = 'GraphQLQuery';
            break;
        case 'mutation':
            className = `${naming_1.operationClassName(operationName)}Mutation`;
            protocol = 'GraphQLMutation';
            break;
        default:
            throw new graphql_1.GraphQLError(`Unsupported operation type "${operationType}"`);
    }
    language_1.classDeclaration(generator, {
        className,
        modifiers: ['public', 'final'],
        adoptedProtocols: [protocol]
    }, () => {
        if (source) {
            generator.printOnNewline('public static let operationString =');
            generator.withIndent(() => {
                values_1.multilineString(generator, source);
            });
        }
        if (fragmentsReferenced && fragmentsReferenced.length > 0) {
            generator.printOnNewline('public static var requestString: String { return operationString');
            fragmentsReferenced.forEach(fragment => {
                generator.print(`.appending(${naming_1.structNameForFragmentName(fragment)}.fragmentString)`);
            });
            generator.print(' }');
        }
        generator.printNewlineIfNeeded();
        if (variables && variables.length > 0) {
            const properties = variables.map(({ name, type }) => {
                const propertyName = language_1.escapeIdentifierIfNeeded(name);
                const typeName = types_1.typeNameFromGraphQLType(generator.context, type);
                const isOptional = !(type instanceof graphql_1.GraphQLNonNull || type.ofType instanceof graphql_1.GraphQLNonNull);
                return { name, propertyName, type, typeName, isOptional };
            });
            language_1.propertyDeclarations(generator, properties);
            generator.printNewlineIfNeeded();
            initializerDeclarationForProperties(generator, properties);
            generator.printNewlineIfNeeded();
            generator.printOnNewline(`public var variables: GraphQLMap?`);
            generator.withinBlock(() => {
                generator.printOnNewline(printing_1.wrap(`return [`, printing_1.join(properties.map(({ name, propertyName }) => `"${name}": ${propertyName}`), ', ') || ':', `]`));
            });
        }
        else {
            initializerDeclarationForProperties(generator, []);
        }
        structDeclarationForSelectionSet(generator, {
            structName: "Data",
            parentType: rootType,
            fields,
            inlineFragments,
            fragmentSpreads
        });
    });
}
exports.classDeclarationForOperation = classDeclarationForOperation;
function structDeclarationForFragment(generator, { fragmentName, typeCondition, fields, inlineFragments, fragmentSpreads, source }) {
    const structName = naming_1.structNameForFragmentName(fragmentName);
    structDeclarationForSelectionSet(generator, {
        structName,
        adoptedProtocols: ['GraphQLFragment'],
        parentType: typeCondition,
        fields,
        inlineFragments,
        fragmentSpreads
    }, () => {
        if (source) {
            generator.printOnNewline('public static let fragmentString =');
            generator.withIndent(() => {
                values_1.multilineString(generator, source);
            });
        }
    });
}
exports.structDeclarationForFragment = structDeclarationForFragment;
function structDeclarationForSelectionSet(generator, { structName, adoptedProtocols = ['GraphQLSelectionSet'], parentType, fields, inlineFragments, fragmentSpreads, }, beforeClosure) {
    const possibleTypes = parentType ? types_1.possibleTypesForType(generator.context, parentType) : null;
    language_1.structDeclaration(generator, { structName, adoptedProtocols }, () => {
        if (beforeClosure) {
            beforeClosure();
        }
        if (possibleTypes) {
            generator.printNewlineIfNeeded();
            generator.printOnNewline('public static let possibleTypes = [');
            generator.print(printing_1.join(possibleTypes.map(type => `"${String(type)}"`), ', '));
            generator.print(']');
        }
        generator.printNewlineIfNeeded();
        generator.printOnNewline('public static let selections: [Selection] = ');
        selectionSetInitialization(generator, fields, inlineFragments, structName);
        generator.printNewlineIfNeeded();
        language_1.propertyDeclaration(generator, { propertyName: "snapshot", typeName: "Snapshot" });
        generator.printNewlineIfNeeded();
        generator.printOnNewline('public init(snapshot: Snapshot)');
        generator.withinBlock(() => {
            generator.printOnNewline(`self.snapshot = snapshot`);
        });
        if (!possibleTypes || possibleTypes.length == 1) {
            generator.printNewlineIfNeeded();
            generator.printOnNewline(`public init`);
            const properties = fields
                .map(field => naming_1.propertyFromField(generator.context, field))
                .filter(field => field.propertyName != "__typename");
            parametersForProperties(generator, properties);
            generator.withinBlock(() => {
                generator.printOnNewline(printing_1.wrap(`self.init(snapshot: [`, printing_1.join([
                    `"__typename": "${possibleTypes[0]}"`,
                    ...properties.map(({ propertyName }) => `"${propertyName}": ${propertyName}`)
                ], ', ') || ':', `])`));
            });
        }
        else {
            possibleTypes.forEach(possibleType => {
                generator.printNewlineIfNeeded();
                generator.printOnNewline(`public static func make${possibleType}`);
                const inlineFragment = inlineFragments && inlineFragments.find(inlineFragment => inlineFragment.typeCondition === possibleType);
                const fieldsForPossibleType = inlineFragment ? inlineFragment.fields : fields;
                const properties = fieldsForPossibleType
                    .map(field => naming_1.propertyFromField(generator.context, field, inlineFragment && naming_1.structNameForInlineFragment(inlineFragment)))
                    .filter(field => field.propertyName != "__typename");
                parametersForProperties(generator, properties);
                generator.print(` -> ${structName}`);
                generator.withinBlock(() => {
                    generator.printOnNewline(printing_1.wrap(`return ${structName}(snapshot: [`, printing_1.join([
                        `"__typename": "${possibleType}"`,
                        ...properties.map(({ propertyName }) => `"${propertyName}": ${propertyName}`)
                    ], ', ') || ':', `])`));
                });
            });
        }
        fields.forEach(field => propertyDeclarationForField(generator, field));
        inlineFragments && inlineFragments.forEach(inlineFragment => propertyDeclarationForInlineFragment(generator, inlineFragment));
        if (fragmentSpreads && fragmentSpreads.length > 0) {
            generator.printNewlineIfNeeded();
            generator.printOnNewline(`public var fragments: Fragments`);
            generator.withinBlock(() => {
                generator.printOnNewline("get");
                generator.withinBlock(() => {
                    generator.printOnNewline(`return Fragments(snapshot: snapshot)`);
                });
                generator.printOnNewline("set");
                generator.withinBlock(() => {
                    generator.printOnNewline(`snapshot = newValue.snapshot`);
                });
            });
        }
        if (inlineFragments && inlineFragments.length > 0) {
            inlineFragments.forEach((inlineFragment) => {
                structDeclarationForSelectionSet(generator, {
                    structName: naming_1.structNameForInlineFragment(inlineFragment),
                    parentType: inlineFragment.typeCondition,
                    adoptedProtocols: ['GraphQLFragment'],
                    fields: inlineFragment.fields,
                    inlineFragments: inlineFragment.inlineFragments,
                    fragmentSpreads: inlineFragment.fragmentSpreads
                });
            });
        }
        if (fragmentSpreads && fragmentSpreads.length > 0) {
            language_1.structDeclaration(generator, {
                structName: 'Fragments'
            }, () => {
                language_1.propertyDeclaration(generator, { propertyName: "snapshot", typeName: "Snapshot" });
                fragmentSpreads.forEach(fragmentSpread => {
                    const { propertyName, bareTypeName, typeName, fragment } = naming_1.propertyFromFragmentSpread(generator.context, fragmentSpread);
                    const isOptional = !graphql_2.isTypeProperSuperTypeOf(generator.context.schema, fragment.typeCondition, parentType);
                    generator.printNewlineIfNeeded();
                    generator.printOnNewline(`public var ${propertyName}: ${isOptional ? typeName + '?' : typeName}`);
                    generator.withinBlock(() => {
                        generator.printOnNewline("get");
                        generator.withinBlock(() => {
                            if (isOptional) {
                                generator.printOnNewline(`if !${typeName}.possibleTypes.contains(snapshot["__typename"]! as! String) { return nil }`);
                            }
                            generator.printOnNewline(`return ${typeName}(snapshot: snapshot)`);
                        });
                        generator.printOnNewline("set");
                        generator.withinBlock(() => {
                            if (isOptional) {
                                generator.printOnNewline(`guard let newValue = newValue else { return }`);
                                generator.printOnNewline(`snapshot = newValue.snapshot`);
                            }
                            else {
                                generator.printOnNewline(`snapshot = newValue.snapshot`);
                            }
                        });
                    });
                });
            });
        }
        fields.filter(field => graphql_1.isCompositeType(graphql_1.getNamedType(field.type))).forEach(field => {
            structDeclarationForSelectionSet(generator, {
                structName: naming_1.structNameForPropertyName(field.responseName),
                parentType: graphql_1.getNamedType(field.type),
                fields: field.fields,
                inlineFragments: field.inlineFragments,
                fragmentSpreads: field.fragmentSpreads
            });
        });
    });
}
exports.structDeclarationForSelectionSet = structDeclarationForSelectionSet;
function propertyDeclarationForField(generator, field) {
    const { kind, propertyName, typeName, type, isConditional, description } = naming_1.propertyFromField(generator.context, field);
    const responseName = field.responseName;
    const namedType = graphql_1.getNamedType(type);
    generator.printNewlineIfNeeded();
    language_1.comment(generator, description);
    generator.printOnNewline(`public var ${propertyName}: ${typeName}`);
    generator.withinBlock(() => {
        if (graphql_1.isCompositeType(namedType)) {
            const isOptional = isConditional || !(type instanceof graphql_1.GraphQLNonNull);
            const isList = type instanceof graphql_1.GraphQLList || type.ofType instanceof graphql_1.GraphQLList;
            const structName = language_1.escapeIdentifierIfNeeded(naming_1.structNameForPropertyName(propertyName));
            if (isList) {
                generator.printOnNewline("get");
                generator.withinBlock(() => {
                    const snapshotTypeName = types_1.typeNameFromGraphQLType(generator.context, type, 'Snapshot', isOptional);
                    let getter = `return (snapshot["${responseName}"]! as! ${snapshotTypeName})`;
                    getter += mapExpressionForType(generator.context, type, `${structName}(snapshot: $0)`);
                    generator.printOnNewline(getter);
                });
                generator.printOnNewline("set");
                generator.withinBlock(() => {
                    let newValueExpression = "newValue" + mapExpressionForType(generator.context, type, `$0.snapshot`);
                    generator.printOnNewline(`snapshot.updateValue(${newValueExpression}, forKey: "${responseName}")`);
                });
            }
            else {
                generator.printOnNewline("get");
                generator.withinBlock(() => {
                    if (isOptional) {
                        generator.printOnNewline(`return (snapshot["${responseName}"]! as! Snapshot?).flatMap { ${structName}(snapshot: $0) }`);
                    }
                    else {
                        generator.printOnNewline(`return ${structName}(snapshot: snapshot["${responseName}"]! as! Snapshot)`);
                    }
                });
                generator.printOnNewline("set");
                generator.withinBlock(() => {
                    let newValueExpression;
                    if (isOptional) {
                        newValueExpression = 'newValue?.snapshot';
                    }
                    else {
                        newValueExpression = 'newValue.snapshot';
                    }
                    generator.printOnNewline(`snapshot.updateValue(${newValueExpression}, forKey: "${responseName}")`);
                });
            }
        }
        else {
            generator.printOnNewline("get");
            generator.withinBlock(() => {
                generator.printOnNewline(`return snapshot["${responseName}"]! as! ${typeName}`);
            });
            generator.printOnNewline("set");
            generator.withinBlock(() => {
                generator.printOnNewline(`snapshot.updateValue(newValue, forKey: "${responseName}")`);
            });
        }
    });
}
function propertyDeclarationForInlineFragment(generator, inlineFragment) {
    const { kind, propertyName, typeName, type, isConditional, description } = naming_1.propertyFromInlineFragment(generator.context, inlineFragment);
    const namedType = graphql_1.getNamedType(type);
    generator.printNewlineIfNeeded();
    language_1.comment(generator, description);
    generator.printOnNewline(`public var ${propertyName}: ${typeName}`);
    generator.withinBlock(() => {
        const structName = naming_1.structNameForInlineFragment(inlineFragment);
        generator.printOnNewline("get");
        generator.withinBlock(() => {
            generator.printOnNewline(`if !${structName}.possibleTypes.contains(__typename) { return nil }`);
            generator.printOnNewline(`return ${structName}(snapshot: snapshot)`);
        });
        generator.printOnNewline("set");
        generator.withinBlock(() => {
            generator.printOnNewline(`guard let newValue = newValue else { return }`);
            generator.printOnNewline(`snapshot = newValue.snapshot`);
        });
    });
}
function mapExpressionForType(context, type, expression, prefix = '') {
    let isOptional;
    if (type instanceof graphql_1.GraphQLNonNull) {
        isOptional = false;
        type = type.ofType;
    }
    else {
        isOptional = true;
    }
    if (type instanceof graphql_1.GraphQLList) {
        if (isOptional) {
            return `${prefix}.flatMap { $0.map { ${mapExpressionForType(context, type.ofType, expression, '$0')} } }`;
        }
        else {
            return `${prefix}.map { ${mapExpressionForType(context, type.ofType, expression, '$0')} }`;
        }
    }
    else if (isOptional) {
        return `${prefix}.flatMap { ${expression} }`;
    }
    else {
        return expression;
    }
}
function initializerDeclarationForProperties(generator, properties) {
    generator.printOnNewline(`public init`);
    parametersForProperties(generator, properties);
    generator.withinBlock(() => {
        properties.forEach(({ propertyName }) => {
            generator.printOnNewline(`self.${propertyName} = ${propertyName}`);
        });
    });
}
exports.initializerDeclarationForProperties = initializerDeclarationForProperties;
function parametersForProperties(generator, properties) {
    generator.print('(');
    generator.print(printing_1.join(properties.map(({ propertyName, type, typeName, isOptional }) => printing_1.join([
        `${propertyName}: ${typeName}`,
        isOptional && ' = nil'
    ])), ', '));
    generator.print(')');
}
function selectionSetInitialization(generator, fields, inlineFragments, parentStructName) {
    generator.print('[');
    generator.withIndent(() => {
        fields.forEach(field => {
            const { responseName, fieldName, args, type } = field;
            const structName = printing_1.join([parentStructName, naming_1.structNameForPropertyName(responseName)], '.');
            generator.printOnNewline(`Field(`);
            generator.print(printing_1.join([
                `"${fieldName}"`,
                responseName != fieldName ? `alias: "${responseName}"` : null,
                args && args.length && `arguments: ${values_1.dictionaryLiteralForFieldArguments(args)}`,
                `type: ${types_1.fieldTypeEnum(generator.context, type, structName)}`
            ], ', '));
            generator.print('),');
        });
        inlineFragments && inlineFragments.forEach(InlineFragment => {
            const structName = printing_1.join([parentStructName, naming_1.structNameForInlineFragment(InlineFragment)], '.');
            generator.printOnNewline(`FragmentSpread(${structName}.self),`);
        });
    });
    generator.printOnNewline(']');
}
exports.selectionSetInitialization = selectionSetInitialization;
function typeDeclarationForGraphQLType(generator, type) {
    if (type instanceof graphql_1.GraphQLEnumType) {
        enumerationDeclaration(generator, type);
    }
    else if (type instanceof graphql_1.GraphQLInputObjectType) {
        structDeclarationForInputObjectType(generator, type);
    }
}
exports.typeDeclarationForGraphQLType = typeDeclarationForGraphQLType;
function enumerationDeclaration(generator, type) {
    const { name, description } = type;
    const values = type.getValues();
    generator.printNewlineIfNeeded();
    generator.printOnNewline(description && `/// ${description}`);
    generator.printOnNewline(`public enum ${name}: String`);
    generator.withinBlock(() => {
        values.forEach(value => generator.printOnNewline(`case ${language_1.escapeIdentifierIfNeeded(naming_1.enumCaseName(value.name))} = "${value.value}"${printing_1.wrap(' /// ', value.description)}`));
    });
    generator.printNewline();
    generator.printOnNewline(`extension ${name}: Apollo.JSONDecodable, Apollo.JSONEncodable {}`);
}
function structDeclarationForInputObjectType(generator, type) {
    const { name: structName, description } = type;
    const adoptedProtocols = ['GraphQLMapConvertible'];
    const fields = Object.values(type.getFields());
    const properties = fields.map(field => naming_1.propertyFromField(generator.context, field));
    properties.forEach(property => {
        if (property.isOptional) {
            property.typeName = `Optional<${property.typeName}>`;
        }
    });
    language_1.structDeclaration(generator, { structName, description, adoptedProtocols }, () => {
        language_1.propertyDeclarations(generator, properties);
        generator.printNewlineIfNeeded();
        initializerDeclarationForProperties(generator, properties);
        generator.printNewlineIfNeeded();
        generator.printOnNewline(`public var graphQLMap: GraphQLMap`);
        generator.withinBlock(() => {
            generator.printOnNewline(printing_1.wrap(`return [`, printing_1.join(properties.map(({ name, propertyName }) => `"${name}": ${propertyName}`), ', ') || ':', `]`));
        });
    });
}
//# sourceMappingURL=codeGeneration.js.map