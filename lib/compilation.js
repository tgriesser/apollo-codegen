"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const graphql_2 = require("./utilities/graphql");
const printing_1 = require("./utilities/printing");
function compileToIR(schema, document, options = { mergeInFieldsFromFragmentSpreads: true }) {
    if (options.addTypename) {
        document = graphql_2.withTypenameFieldAddedWhereNeeded(schema, document);
    }
    const compiler = new Compiler(schema, document, options);
    const operations = Object.create(null);
    compiler.operations.forEach(operation => {
        operations[operation.name.value] = compiler.compileOperation(operation);
    });
    const fragments = Object.create(null);
    compiler.fragments.forEach(fragment => {
        fragments[fragment.name.value] = compiler.compileFragment(fragment);
    });
    const typesUsed = compiler.typesUsed;
    return { schema, operations, fragments, typesUsed };
}
exports.compileToIR = compileToIR;
class Compiler {
    constructor(schema, document, options) {
        this.schema = schema;
        this.options = options;
        this.typesUsedSet = new Set();
        this.fragmentMap = Object.create(null);
        this.operations = [];
        for (const definition of document.definitions) {
            switch (definition.kind) {
                case graphql_1.Kind.OPERATION_DEFINITION:
                    this.operations.push(definition);
                    break;
                case graphql_1.Kind.FRAGMENT_DEFINITION:
                    this.fragmentMap[definition.name.value] = definition;
                    break;
            }
        }
        this.compiledFragmentMap = Object.create(null);
    }
    addTypeUsed(type) {
        if (this.typesUsedSet.has(type))
            return;
        if (type instanceof graphql_1.GraphQLEnumType ||
            type instanceof graphql_1.GraphQLInputObjectType ||
            (type instanceof graphql_1.GraphQLScalarType && !graphql_2.isBuiltInScalarType(type))) {
            this.typesUsedSet.add(type);
        }
        if (type instanceof graphql_1.GraphQLInputObjectType) {
            for (const field of Object.values(type.getFields())) {
                this.addTypeUsed(graphql_1.getNamedType(field.type));
            }
        }
    }
    get typesUsed() {
        return Array.from(this.typesUsedSet);
    }
    fragmentNamed(fragmentName) {
        return this.fragmentMap[fragmentName];
    }
    get fragments() {
        return Object.values(this.fragmentMap);
    }
    compileOperation(operationDefinition) {
        const filePath = graphql_2.filePathForNode(operationDefinition);
        const operationName = operationDefinition.name.value;
        const operationType = operationDefinition.operation;
        const variables = operationDefinition.variableDefinitions.map(node => {
            const name = node.variable.name.value;
            const type = graphql_1.typeFromAST(this.schema, node.type);
            this.addTypeUsed(graphql_1.getNamedType(type));
            return { name, type };
        });
        const source = graphql_1.print(operationDefinition);
        const rootType = graphql_2.getOperationRootType(this.schema, operationDefinition);
        const groupedVisitedFragmentSet = new Map();
        const groupedFieldSet = this.collectFields(rootType, operationDefinition.selectionSet, undefined, groupedVisitedFragmentSet);
        const fragmentsReferencedSet = Object.create(null);
        const { fields } = this.resolveFields(rootType, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet);
        const fragmentsReferenced = Object.keys(fragmentsReferencedSet);
        return { filePath, operationName, operationType, rootType, variables, source, fields, fragmentsReferenced };
    }
    compileFragment(fragmentDefinition) {
        const filePath = graphql_2.filePathForNode(fragmentDefinition);
        const fragmentName = fragmentDefinition.name.value;
        const source = graphql_1.print(fragmentDefinition);
        const typeCondition = graphql_1.typeFromAST(this.schema, fragmentDefinition.typeCondition);
        const possibleTypes = this.possibleTypesForType(typeCondition);
        const groupedVisitedFragmentSet = new Map();
        const groupedFieldSet = this.collectFields(typeCondition, fragmentDefinition.selectionSet, undefined, groupedVisitedFragmentSet);
        const fragmentsReferencedSet = Object.create(null);
        const { fields, fragmentSpreads, inlineFragments } = this.resolveFields(typeCondition, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet);
        const fragmentsReferenced = Object.keys(fragmentsReferencedSet);
        return { filePath, fragmentName, source, typeCondition, possibleTypes, fields, fragmentSpreads, inlineFragments, fragmentsReferenced };
    }
    collectFields(parentType, selectionSet, groupedFieldSet = Object.create(null), groupedVisitedFragmentSet = new Map()) {
        if (!graphql_1.isCompositeType(parentType)) {
            throw new Error(`parentType should be a composite type, but is "${String(parentType)}"`);
        }
        for (const selection of selectionSet.selections) {
            switch (selection.kind) {
                case graphql_1.Kind.FIELD: {
                    const fieldName = selection.name.value;
                    const responseName = selection.alias ? selection.alias.value : fieldName;
                    const field = graphql_2.getFieldDef(this.schema, parentType, selection);
                    if (!field) {
                        throw new graphql_1.GraphQLError(`Cannot query field "${fieldName}" on type "${String(parentType)}"`, [selection]);
                    }
                    if (groupedFieldSet) {
                        if (!groupedFieldSet[responseName]) {
                            groupedFieldSet[responseName] = [];
                        }
                        groupedFieldSet[responseName].push([parentType, {
                                responseName,
                                fieldName,
                                args: argumentsFromAST(selection.arguments),
                                type: field.type,
                                directives: selection.directives,
                                selectionSet: selection.selectionSet
                            }]);
                    }
                    break;
                }
                case graphql_1.Kind.INLINE_FRAGMENT: {
                    const typeCondition = selection.typeCondition;
                    const inlineFragmentType = typeCondition ?
                        graphql_1.typeFromAST(this.schema, typeCondition) :
                        parentType;
                    if (!graphql_1.doTypesOverlap(this.schema, inlineFragmentType, parentType))
                        continue;
                    const effectiveType = parentType instanceof graphql_1.GraphQLObjectType ? parentType : inlineFragmentType;
                    this.collectFields(effectiveType, selection.selectionSet, groupedFieldSet, groupedVisitedFragmentSet);
                    break;
                }
                case graphql_1.Kind.FRAGMENT_SPREAD: {
                    const fragmentName = selection.name.value;
                    const fragment = this.fragmentNamed(fragmentName);
                    if (!fragment)
                        throw new graphql_1.GraphQLError(`Cannot find fragment "${fragmentName}"`);
                    const typeCondition = fragment.typeCondition;
                    const fragmentType = graphql_1.typeFromAST(this.schema, typeCondition);
                    if (groupedVisitedFragmentSet) {
                        let visitedFragmentSet = groupedVisitedFragmentSet.get(parentType);
                        if (!visitedFragmentSet) {
                            visitedFragmentSet = {};
                            groupedVisitedFragmentSet.set(parentType, visitedFragmentSet);
                        }
                        if (visitedFragmentSet[fragmentName])
                            continue;
                        visitedFragmentSet[fragmentName] = true;
                    }
                    if (!graphql_1.doTypesOverlap(this.schema, fragmentType, parentType))
                        continue;
                    const effectiveType = parentType instanceof graphql_1.GraphQLObjectType ? parentType : fragmentType;
                    this.collectFields(effectiveType, fragment.selectionSet, this.options.mergeInFieldsFromFragmentSpreads ? groupedFieldSet : null, groupedVisitedFragmentSet);
                    break;
                }
            }
        }
        return groupedFieldSet;
    }
    possibleTypesForType(type) {
        if (graphql_1.isAbstractType(type)) {
            return this.schema.getPossibleTypes(type);
        }
        else {
            return [type];
        }
    }
    mergeSelectionSets(parentType, fieldSet, groupedVisitedFragmentSet) {
        const groupedFieldSet = Object.create(null);
        for (const [, field] of fieldSet) {
            const selectionSet = field.selectionSet;
            if (selectionSet) {
                this.collectFields(parentType, selectionSet, groupedFieldSet, groupedVisitedFragmentSet);
            }
        }
        return groupedFieldSet;
    }
    resolveFields(parentType, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet) {
        const fields = [];
        for (let [responseName, fieldSet] of Object.entries(groupedFieldSet)) {
            fieldSet = fieldSet.filter(([typeCondition,]) => graphql_1.isTypeSubTypeOf(this.schema, parentType, typeCondition));
            if (fieldSet.length < 1)
                continue;
            const [, firstField] = fieldSet[0];
            const fieldName = firstField.fieldName;
            const args = firstField.args;
            const type = firstField.type;
            let field = { responseName, fieldName, type };
            if (args && args.length > 0) {
                field.args = args;
            }
            const isConditional = fieldSet.some(([, field]) => {
                return field.directives && field.directives.some(directive => {
                    const directiveName = directive.name.value;
                    return directiveName == 'skip' || directiveName == 'include';
                });
            });
            if (isConditional) {
                field.isConditional = true;
            }
            if (parentType instanceof graphql_1.GraphQLObjectType || parentType instanceof graphql_1.GraphQLInterfaceType) {
                const fieldDef = parentType.getFields()[fieldName];
                if (fieldDef) {
                    const description = fieldDef.description;
                    if (description) {
                        field.description = description;
                    }
                    Object.assign(field, {
                        isDeprecated: fieldDef.isDeprecated,
                        deprecationReason: fieldDef.deprecationReason,
                    });
                }
            }
            const bareType = graphql_1.getNamedType(type);
            this.addTypeUsed(bareType);
            if (graphql_1.isCompositeType(bareType)) {
                const subSelectionGroupedVisitedFragmentSet = new Map();
                const subSelectionGroupedFieldSet = this.mergeSelectionSets(bareType, fieldSet, subSelectionGroupedVisitedFragmentSet);
                const { fields, fragmentSpreads, inlineFragments } = this.resolveFields(bareType, subSelectionGroupedFieldSet, subSelectionGroupedVisitedFragmentSet, fragmentsReferencedSet);
                Object.assign(field, { fields, fragmentSpreads, inlineFragments });
            }
            fields.push(field);
        }
        const fragmentSpreads = this.fragmentSpreadsForParentType(parentType, groupedVisitedFragmentSet);
        const inlineFragments = this.resolveInlineFragments(parentType, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet);
        if (fragmentsReferencedSet) {
            Object.assign(fragmentsReferencedSet, ...groupedVisitedFragmentSet.values());
            for (let fragmentName of fragmentSpreads) {
                const fragment = this.fragmentNamed(fragmentName);
                if (!fragment)
                    throw new graphql_1.GraphQLError(`Cannot find fragment "${fragmentName}"`);
                const { fragmentsReferenced: fragmentsReferencedFromFragment } = this.compileFragment(fragment);
                for (let fragmentReferenced of fragmentsReferencedFromFragment) {
                    fragmentsReferencedSet[fragmentReferenced] = true;
                }
            }
        }
        return { fields, fragmentSpreads, inlineFragments };
    }
    resolveInlineFragments(parentType, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet) {
        return this.collectPossibleTypes(parentType, groupedFieldSet, groupedVisitedFragmentSet).map(typeCondition => {
            const { fields, fragmentSpreads } = this.resolveFields(typeCondition, groupedFieldSet, groupedVisitedFragmentSet, fragmentsReferencedSet);
            const possibleTypes = this.possibleTypesForType(typeCondition);
            return { typeCondition, possibleTypes, fields, fragmentSpreads };
        });
    }
    collectPossibleTypes(parentType, groupedFieldSet, groupedVisitedFragmentSet) {
        if (!graphql_1.isAbstractType(parentType))
            return [];
        const possibleTypes = new Set();
        for (const fieldSet of Object.values(groupedFieldSet)) {
            for (const [typeCondition,] of fieldSet) {
                if (this.schema.isPossibleType(parentType, typeCondition)) {
                    possibleTypes.add(typeCondition);
                }
            }
        }
        if (groupedVisitedFragmentSet) {
            for (const effectiveType of groupedVisitedFragmentSet.keys()) {
                if (this.schema.isPossibleType(parentType, effectiveType)) {
                    possibleTypes.add(effectiveType);
                }
            }
        }
        return Array.from(possibleTypes);
    }
    fragmentSpreadsForParentType(parentType, groupedVisitedFragmentSet) {
        if (!groupedVisitedFragmentSet)
            return [];
        let fragmentSpreads = new Set();
        for (const [effectiveType, visitedFragmentSet] of groupedVisitedFragmentSet) {
            if (!graphql_2.isTypeProperSuperTypeOf(this.schema, effectiveType, parentType))
                continue;
            for (const fragmentName of Object.keys(visitedFragmentSet)) {
                fragmentSpreads.add(fragmentName);
            }
        }
        return Array.from(fragmentSpreads);
    }
}
exports.Compiler = Compiler;
function argumentsFromAST(args) {
    return args && args.map(arg => {
        return { name: arg.name.value, value: graphql_2.valueFromValueNode(arg.value) };
    });
}
function printIR({ fields, inlineFragments, fragmentSpreads }) {
    return fields && printing_1.wrap('<', printing_1.join(fragmentSpreads, ', '), '> ')
        + printing_1.block(fields.map(field => `${field.name}: ${String(field.type)}` + printing_1.wrap(' ', printIR(field))).concat(inlineFragments && inlineFragments.map(inlineFragment => `${String(inlineFragment.typeCondition)}` + printing_1.wrap(' ', printIR(inlineFragment)))));
}
exports.printIR = printIR;
//# sourceMappingURL=compilation.js.map