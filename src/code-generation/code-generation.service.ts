import { Injectable, BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectType } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as archiver from 'archiver';
import { createWriteStream } from 'fs';
import * as ejs from 'ejs';

@Injectable()
export class CodeGenerationService {
  constructor(private prisma: PrismaService) {}

  async generateSpringBootProject(diagramId: string, userId: string) {
    console.log(`🚀 Generating Spring Boot project for diagram: ${diagramId}`);

    // Get diagram data from JSON field (NOT from relational tables)
    const diagram = await this.prisma.retryQuery(() =>
      this.prisma.diagram.findUnique({
        where: { id: diagramId },
      })
    );

    if (!diagram) {
      throw new BadRequestException('Diagram not found');
    }

    // Extract classes and relations from the JSON data field
    const diagramData = diagram.data as any;
    const classes = diagramData.classes || [];
    const relations = diagramData.relations || [];

    console.log(`📊 Diagram found: ${diagram.name}`);
    console.log(`📦 Classes count: ${classes.length}`);
    console.log(`🔗 Relations count: ${relations.length}`);

    // Validate and normalize diagram before generation
    this.validateAndNormalizeDiagram(classes);

    // Prepare project metadata
    const projectName = diagram.name.toLowerCase().replace(/\s+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectPath = `./generated-projects/${projectName}-${timestamp}`;
    const basePackage = `com.example.${projectName.replace(/-/g, '')}`;
    const dbName = projectName.replace(/-/g, '_');

    console.log(`📁 Project path: ${projectPath}`);
    console.log(`📦 Base package: ${basePackage}`);

    try {
      // Create project structure
      await this.createProjectStructure(projectPath, projectName);
      console.log('✅ Project structure created');

      // Transform diagram data to template-friendly format
      const transformedClasses = this.transformClasses(classes, relations);
      console.log(`✅ Transformed ${transformedClasses.length} classes`);

      // Generate files using EJS templates
      await this.generateFromTemplates(projectPath, {
        projectName,
        basePackage,
        dbName,
        classes: transformedClasses,
        relations, // AÑADIDO: Pasar relaciones para generar tablas intermedias
      });
      console.log('✅ Files generated from templates');

      // Create ZIP file
      const zipPath = `${projectPath}.zip`;
      await this.createZipFile(projectPath, zipPath);
      console.log(`✅ ZIP file created: ${zipPath}`);

      // Save generation record (with retry logic)
      const generatedCode = await this.prisma.retryQuery(() =>
        this.prisma.generatedCode.create({
          data: {
            projectType: ProjectType.SPRING_BOOT,
            zipPath: zipPath,
            diagramId,
            generatedBy: userId,
          },
        })
      );

      return {
        success: true,
        projectPath,
        zipPath,
        generatedCodeId: generatedCode.id,
        message: 'Spring Boot project generated successfully with tests and Docker configuration',
      };
    } catch (error) {
      console.error('❌ Error generating project:', error);
      console.error('Stack trace:', error.stack);
      throw new Error(`Failed to generate Spring Boot project: ${error.message}`);
    }
  }

  async generateFlutterProject(diagramId: string, userId: string) {
    console.log(`📱 Generating Flutter project for diagram: ${diagramId}`);

    // Get diagram data from JSON field
    const diagram = await this.prisma.retryQuery(() =>
      this.prisma.diagram.findUnique({
        where: { id: diagramId },
      })
    );

    if (!diagram) {
      throw new BadRequestException('Diagram not found');
    }

    // Extract classes and relations from the JSON data field
    const diagramData = diagram.data as any;
    const classes = diagramData.classes || [];
    const relations = diagramData.relations || [];

    console.log(`📊 Diagram found: ${diagram.name}`);
    console.log(`📦 Classes count: ${classes.length}`);
    console.log(`🔗 Relations count: ${relations.length}`);

    // Validate and normalize diagram
    this.validateAndNormalizeDiagram(classes);

    // Prepare project metadata
    const projectName = diagram.name.toLowerCase().replace(/\s+/g, '-');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectPath = `./generated-projects/${projectName}-flutter-${timestamp}`;

    console.log(`📁 Flutter project path: ${projectPath}`);

    try {
      // Create Flutter project structure
      await this.createFlutterProjectStructure(projectPath, projectName);
      console.log('✅ Flutter project structure created');

      // Transform diagram data to template-friendly format
      const transformedClasses = this.transformClasses(classes, relations);
      console.log(`✅ Transformed ${transformedClasses.length} classes`);

      // Generate files using EJS templates
      await this.generateFlutterFromTemplates(projectPath, {
        projectName,
        classes: transformedClasses,
        relations,
      });
      console.log('✅ Flutter files generated from templates');

      // Create ZIP file
      const zipPath = `${projectPath}.zip`;
      await this.createZipFile(projectPath, zipPath);
      console.log(`✅ Flutter ZIP file created: ${zipPath}`);

      // Save generation record
      const generatedCode = await this.prisma.retryQuery(() =>
        this.prisma.generatedCode.create({
          data: {
            projectType: ProjectType.FLUTTER, // Necesitarás agregar esto al enum
            zipPath: zipPath,
            diagramId,
            generatedBy: userId,
          },
        })
      );

      return {
        success: true,
        projectPath,
        zipPath,
        generatedCodeId: generatedCode.id,
        message: 'Flutter project generated successfully with CRUD screens',
      };
    } catch (error) {
      console.error('❌ Error generating Flutter project:', error);
      console.error('Stack trace:', error.stack);
      throw new Error(`Failed to generate Flutter project: ${error.message}`);
    }
  }

  private validateAndNormalizeDiagram(classes: any[]) {
    if (!classes || classes.length === 0) {
      throw new BadRequestException('Diagram must contain at least one class');
    }

    console.log('🔍 Validating and normalizing diagram...');

    // Check each class and add ID if missing
    for (const umlClass of classes) {
      // Initialize attributes array if it doesn't exist
      if (!umlClass.attributes) {
        umlClass.attributes = [];
      }

      console.log(`  Checking class: ${umlClass.name}, attributes: ${umlClass.attributes.length}`);

      const hasId = umlClass.attributes.some((attr: any) => attr.stereotype === 'id');

      if (!hasId) {
        console.log(`  ⚠️  No ID found for ${umlClass.name}, adding default 'id' attribute`);

        // Auto-add ID attribute if missing
        umlClass.attributes.unshift({
          id: `${umlClass.id}_id_attr`,
          name: 'id',
          type: 'Long',
          stereotype: 'id',
          nullable: false,
          unique: true,
        });
      }
    }

    console.log('✅ Diagram validated and normalized');
  }

  private transformClasses(umlClasses: any[], relations: any[]) {
    return umlClasses.map((umlClass) => {
      const className = umlClass.name;
      const varName = className.charAt(0).toLowerCase() + className.slice(1);
      const pluralName = this.pluralize(className.toLowerCase());
      const tableName = className.toLowerCase();

      // Check if this class is a child in an inheritance relationship
      const inheritanceRelation = relations.find(r => r.type === 'INHERITANCE' && r.sourceClassId === umlClass.id);
      let parentClass = null;
      if (inheritanceRelation) {
        parentClass = umlClasses.find(c => c.id === inheritanceRelation.targetClassId);
      }

      // Get ID attribute
      const idAttribute = umlClass.attributes.find((attr: any) => attr.stereotype === 'id');
      const idType = idAttribute ? this.mapToJavaType(idAttribute.type) : 'Long';

      // Transform attributes
      let attributes = this.transformAttributes(umlClass.attributes, umlClass.id, className, relations, umlClasses, parentClass);

      // If this class inherits from a parent, include parent's attributes for DTO/Service generation
      if (parentClass) {
        const parentAttributes = this.transformAttributes(parentClass.attributes, parentClass.id, parentClass.name, relations, umlClasses, null);
        // Prepend parent attributes (they should come first, excluding ID which child already has with same column name)
        const parentAttrsExceptId = parentAttributes.filter(a => !a.isId);
        attributes = [...parentAttrsExceptId, ...attributes];
      }

      // Get unique fields for Repository
      const uniqueFields = attributes
        .filter((attr) => attr.unique && !attr.isId)
        .map((attr) => ({
          name: attr.name,
          type: attr.type,
        }));

      // Generate sample data for README
      const sampleData = attributes
        .filter((attr) => !attr.isId && !attr.isRelation)
        .slice(0, 3)
        .map((attr) => ({
          key: attr.name,
          value: attr.sampleValue,
        }));

      // Check if this class is a parent in inheritance (has children)
      const isParentInInheritance = relations.some(r => r.type === 'INHERITANCE' && r.targetClassId === umlClass.id);

      return {
        id: umlClass.id, // IMPORTANTE: Incluir el ID original para matching con relations
        className,
        varName,
        pluralName,
        tableName,
        idType,
        attributes,
        uniqueFields,
        sampleData,
        parentClass: parentClass ? parentClass.name : null,
        isParentInInheritance,
      };
    });
  }

  private transformAttributes(attributes: any[], classId: string, className: string, relations: any[], allClasses: any[], parentClass?: any) {
    const result = [];

    // If this class inherits from a parent, get parent's PK column name
    let parentIdColumnName = null;
    if (parentClass) {
      const parentIdAttr = parentClass.attributes.find((attr: any) => attr.stereotype === 'id');
      if (parentIdAttr) {
        parentIdColumnName = parentIdAttr.name.toLowerCase();
        console.log(`🔗 [INHERITANCE] ${className} extends ${parentClass.name}, using parent's PK column: ${parentIdColumnName}`);
      }
    }

    // First, add scalar attributes (but skip FK attributes since they'll be generated by relations)
    for (const attr of attributes) {
      const isId = attr.stereotype === 'id';
      const isFk = attr.stereotype === 'fk';

      // Skip FK attributes - they will be generated by the @ManyToOne/@OneToOne relations
      if (isFk) {
        console.log(`⏭️  Skipping FK attribute: ${attr.name} (will be generated by relation)`);
        continue;
      }

      const javaType = this.mapToJavaType(attr.type);

      // For ID fields, always use "id" as Java field name (standardize for getId/setId)
      // For other fields, convert to camelCase
      const javaFieldName = isId ? 'id' : this.toCamelCase(attr.name);

      // If this is the ID and we have a parent, use parent's ID column name
      const columnName = (isId && parentIdColumnName) ? parentIdColumnName : attr.name.toLowerCase();

      result.push({
        name: javaFieldName,
        type: javaType,
        columnName: columnName,
        nullable: attr.nullable !== false,
        unique: attr.unique === true,
        isId,
        isRelation: false,
        length: attr.type === 'String' ? 255 : null,
        sampleValue: this.getSampleValue(javaType),
      });
    }

    // Then, add relations
    const classRelations = relations.filter(
      (r) => r.sourceClassId === classId || r.targetClassId === classId
    );

    for (const relation of classRelations) {
      // Skip INHERITANCE relations completely - they use JPA @Inheritance, not FK fields
      if (relation.type === 'INHERITANCE') {
        console.log(`🔗 [INHERITANCE] Skipping relation for ${className} (handled by @Inheritance/@extends)`);
        continue;
      }

      const isSource = relation.sourceClassId === classId;
      const targetClassId = isSource ? relation.targetClassId : relation.sourceClassId;

      // Find the actual target class name
      const targetClass = allClasses.find(c => c.id === targetClassId);
      if (!targetClass) {
        console.warn(`⚠️  Target class not found for relation: ${relation.id}`);
        continue;
      }

      const targetClassName = targetClass.name;

      // Get the ID type of the target class
      const targetIdAttr = targetClass.attributes.find((attr: any) => attr.stereotype === 'id');
      const targetIdType = targetIdAttr ? this.mapToJavaType(targetIdAttr.type) : 'Long';

      // Try to determine relationship type from multiplicity first
      const multiplicityAnalysis = this.analyzeMultiplicity(relation, isSource);
      const relationType = multiplicityAnalysis.type;

      // Use target class name in camelCase to ensure uniqueness and clarity
      // This prevents duplicate field names when multiple relations point to same or have same relation.name
      const relationName = targetClassName.charAt(0).toLowerCase() + targetClassName.slice(1);

      console.log(`📊 [${className}] relation.name="${relation.name}", relationName="${relationName}", type=${relation.type}->${relationType}, target=${targetClassName}, targetIdType=${targetIdType}, multiplicity=${JSON.stringify(relation.multiplicity)}`);

      if (relationType === 'MANY_TO_ONE') {
        result.push({
          name: relationName,
          type: targetClassName,
          columnName: `${targetClassName.toLowerCase()}_id`,
          nullable: true,
          unique: false,
          isId: false,
          isRelation: true,
          relationType: 'MANY_TO_ONE',
          referencedIdType: targetIdType, // ADDED: Type of the referenced entity's ID
          foreignKey: {
            referencedTable: targetClass.name.toLowerCase(),
            onDelete: 'CASCADE',
            onUpdate: 'CASCADE',
          },
        });
      } else if (relationType === 'ONE_TO_MANY') {
        // For ONE_TO_MANY, mappedBy should be the field name in the target entity (MANY_TO_ONE side)
        // Use className in camelCase to match the field name in the target entity
        const mappedByField = className.charAt(0).toLowerCase() + className.slice(1);

        console.log(`🔗 ONE_TO_MANY: ${className}.${relationName} -> ${targetClassName}, mappedBy="${mappedByField}"`);

        result.push({
          name: `${relationName}s`, // Plural for collections
          type: `List<${targetClassName}>`,
          nullable: true,
          unique: false,
          isId: false,
          isRelation: true,
          relationType: 'ONE_TO_MANY',
          mappedBy: mappedByField,
        });
      } else if (relationType === 'MANY_TO_MANY') {
        // Determine join table name
        let joinTableName: string;

        // First, check if intermediateTable is defined in the relation
        if (relation.intermediateTable && relation.intermediateTable.name) {
          joinTableName = relation.intermediateTable.name.toLowerCase();
          console.log(`🔗 Using explicit intermediate table name: ${joinTableName}`);

          // Log intermediate table attributes
          if (relation.intermediateTable.attributes) {
            console.log(`   Attributes:`, relation.intermediateTable.attributes);
          }
        } else {
          // Generate consistent join table name by sorting alphabetically
          const tables = [className.toLowerCase(), targetClassName.toLowerCase()].sort();
          joinTableName = `${tables[0]}_${tables[1]}`;
          console.log(`🔗 Generated join table name (alphabetically sorted): ${joinTableName}`);
        }

        result.push({
          name: `${relationName}s`, // Plural for collections
          type: `Set<${targetClassName}>`,
          nullable: true,
          unique: false,
          isId: false,
          isRelation: true,
          relationType: 'MANY_TO_MANY',
          joinTable: joinTableName,
          joinColumn: `${className.toLowerCase()}_id`,
          inverseJoinColumn: `${targetClassName.toLowerCase()}_id`,
          foreignKey: {
            referencedTable: targetClass.name.toLowerCase(),
          },
          intermediateTableData: relation.intermediateTable, // AÑADIDO: Pasar metadata completa
        });
      } else if (relationType === 'ONE_TO_ONE') {
        // Check if this side needs the FK based on multiplicity analysis
        console.log(`🔗 [ONE_TO_ONE Attribute] ${className} -> ${targetClassName}, needsFk=${multiplicityAnalysis.needsFk}`);

        if (multiplicityAnalysis.needsFk) {
          // This side has the FK (the optional side in 1 to 0..1)
          console.log(`✅ [ONE_TO_ONE] Adding FK field in ${className}: ${relationName} (${targetClassName.toLowerCase()}_id)`);

          result.push({
            name: relationName,
            type: targetClassName,
            columnName: `${targetClassName.toLowerCase()}_id`,
            nullable: true,
            unique: false,
            isId: false,
            isRelation: true,
            relationType: 'ONE_TO_ONE',
            referencedIdType: targetIdType, // ADDED: Type of the referenced entity's ID
            foreignKey: {
              referencedTable: targetClass.name.toLowerCase(),
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
            },
          });
        } else {
          // This side does NOT have FK, uses mappedBy (the mandatory side in 1 to 0..1)
          // Use className in camelCase to match the field name in the target entity
          const mappedByField = className.charAt(0).toLowerCase() + className.slice(1);

          console.log(`✅ [ONE_TO_ONE] Adding mappedBy field in ${className}: ${relationName} -> mappedBy="${mappedByField}"`);

          result.push({
            name: relationName,
            type: targetClassName,
            nullable: true,
            unique: false,
            isId: false,
            isRelation: true,
            relationType: 'ONE_TO_ONE',
            mappedBy: mappedByField,
          });
        }
      }
    }

    return result;
  }

  /**
   * Analyze multiplicity to determine relationship type and FK direction
   * Examples:
   * - 1 to 1..*: ONE_TO_MANY, FK goes in the "many" side (1..*)
   * - 1..* to 1: MANY_TO_ONE, FK goes in the current class
   * - * to *: MANY_TO_MANY, needs junction table
   * - 1 to 1: ONE_TO_ONE, FK can go in either side
   */
  private analyzeMultiplicity(relation: any, isSource: boolean): { type: string; needsFk: boolean } {
    // Parse multiplicity object
    let sourceMultiplicity = '1';
    let targetMultiplicity = '1';

    if (relation.multiplicity) {
      if (typeof relation.multiplicity === 'string' && relation.multiplicity.includes(':')) {
        const parts = relation.multiplicity.split(':');
        sourceMultiplicity = parts[0] || '1';
        targetMultiplicity = parts[1] || '1';
      } else if (typeof relation.multiplicity === 'object') {
        sourceMultiplicity = relation.multiplicity.source || '1';
        targetMultiplicity = relation.multiplicity.target || '1';
      }
    }

    console.log(`🔍 [analyzeMultiplicity] isSource=${isSource}, source="${sourceMultiplicity}", target="${targetMultiplicity}"`);

    // Helper to check if multiplicity represents "many"
    const isMany = (mult: string) => mult.includes('*') || mult.includes('n') || mult.includes('N');

    // Helper to check if multiplicity is optional (contains 0 but not *)
    // This catches "0..1", "1..0", and "0" but NOT "0..*" (which is many)
    const isOptional = (mult: string) => {
      if (isMany(mult)) return false; // 0..* is many, not optional
      return mult.includes('0'); // Catches "0..1", "1..0", "0"
    };

    const sourceIsMany = isMany(sourceMultiplicity);
    const targetIsMany = isMany(targetMultiplicity);
    const sourceIsOptional = isOptional(sourceMultiplicity);
    const targetIsOptional = isOptional(targetMultiplicity);

    // Determine relationship type based on multiplicities
    if (sourceIsMany && targetIsMany) {
      // * to * = MANY_TO_MANY
      return { type: 'MANY_TO_MANY', needsFk: false };
    } else if (sourceIsMany && !targetIsMany) {
      // * to 1 = from source perspective: MANY_TO_ONE, from target perspective: ONE_TO_MANY
      if (isSource) {
        return { type: 'MANY_TO_ONE', needsFk: true }; // Source needs FK to target
      } else {
        return { type: 'ONE_TO_MANY', needsFk: false }; // Target doesn't need FK
      }
    } else if (!sourceIsMany && targetIsMany) {
      // 1 to * = from source perspective: ONE_TO_MANY, from target perspective: MANY_TO_ONE
      if (isSource) {
        return { type: 'ONE_TO_MANY', needsFk: false }; // Source doesn't need FK
      } else {
        return { type: 'MANY_TO_ONE', needsFk: true }; // Target needs FK to source
      }
    } else {
      // Both are "1" (could be 1 to 1, 1 to 0..1, or 0..1 to 1) = ONE_TO_ONE
      // FK should go in the OPTIONAL side (0..1), or source side if both are "1"
      console.log(`🔍 [ONE_TO_ONE] sourceIsOptional=${sourceIsOptional}, targetIsOptional=${targetIsOptional}`);

      if (sourceIsOptional && !targetIsOptional) {
        // Source is 0..1, target is 1 → FK goes in source
        console.log(`✅ [ONE_TO_ONE] Source is optional (${sourceMultiplicity}), target is mandatory (${targetMultiplicity}) → FK in source, needsFk=${isSource}`);
        return { type: 'ONE_TO_ONE', needsFk: isSource };
      } else if (!sourceIsOptional && targetIsOptional) {
        // Source is 1, target is 0..1 → FK goes in target
        console.log(`✅ [ONE_TO_ONE] Source is mandatory (${sourceMultiplicity}), target is optional (${targetMultiplicity}) → FK in target, needsFk=${!isSource}`);
        return { type: 'ONE_TO_ONE', needsFk: !isSource };
      } else {
        // Both are "1" or both are "0..1" → FK goes in source by convention
        console.log(`✅ [ONE_TO_ONE] Both same (${sourceMultiplicity}, ${targetMultiplicity}) → FK in source by convention, needsFk=${isSource}`);
        return { type: 'ONE_TO_ONE', needsFk: isSource };
      }
    }
  }

  private mapRelationType(relationType: string, isSource: boolean): string {
    // Normalize the relation type (handle different formats)
    const normalizedType = relationType.toUpperCase().replace(/-/g, '_');

    // Map relation types to JPA annotations
    switch (normalizedType) {
      case 'MANYTOMANY':
      case 'MANY_TO_MANY':
        return 'MANY_TO_MANY';

      case 'ONETOMANY':
      case 'ONE_TO_MANY':
        // If this class is the source of OneToMany, it has the collection
        return isSource ? 'ONE_TO_MANY' : 'MANY_TO_ONE';

      case 'MANYTOONE':
      case 'MANY_TO_ONE':
        // If this class is the source of ManyToOne, it has the single reference
        return isSource ? 'MANY_TO_ONE' : 'ONE_TO_MANY';

      case 'ONETOONE':
      case 'ONE_TO_ONE':
        return 'ONE_TO_ONE';

      case 'ASSOCIATION':
        // Generic association defaults to ManyToOne from source side
        return isSource ? 'MANY_TO_ONE' : 'ONE_TO_MANY';

      case 'COMPOSITION':
      case 'AGGREGATION':
        return isSource ? 'ONE_TO_MANY' : 'MANY_TO_ONE';

      case 'INHERITANCE':
        return 'INHERITANCE';

      default:
        console.warn(`⚠️  Unknown relation type: ${relationType}, defaulting to MANY_TO_ONE`);
        return 'MANY_TO_ONE';
    }
  }

  private mapToJavaType(umlType: string): string {
    const typeMap: { [key: string]: string } = {
      String: 'String',
      Integer: 'Integer',
      Long: 'Long',
      BigDecimal: 'BigDecimal',
      Boolean: 'Boolean',
      LocalDate: 'LocalDate',
      LocalDateTime: 'LocalDateTime',
      Double: 'Double',
      Float: 'Float',
    };

    return typeMap[umlType] || 'String';
  }

  private getSampleValue(javaType: string): string {
    const sampleMap: { [key: string]: string } = {
      String: '"Sample String"',
      Integer: '123',
      Long: '123L',
      BigDecimal: 'new BigDecimal("99.99")',
      Boolean: 'true',
      LocalDate: 'LocalDate.now()',
      LocalDateTime: 'LocalDateTime.now()',
      Double: '99.99',
      Float: '99.99f',
    };

    return sampleMap[javaType] || '""';
  }

  /**
   * Convert snake_case to camelCase
   * Examples: id_persona -> idPersona, failed_login_attempts -> failedLoginAttempts
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    } else if (word.endsWith('s')) {
      return word + 'es';
    } else {
      return word + 's';
    }
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private async createProjectStructure(projectPath: string, projectName: string) {
    const basePackage = `src/main/java/com/example/${projectName.replace(/-/g, '')}`;
    const resourcesPath = 'src/main/resources';
    const testPath = `src/test/java/com/example/${projectName.replace(/-/g, '')}`;

    const directories = [
      `${projectPath}/${basePackage}/entity`,
      `${projectPath}/${basePackage}/repository`,
      `${projectPath}/${basePackage}/service`,
      `${projectPath}/${basePackage}/controller`,
      `${projectPath}/${basePackage}/dto`,
      `${projectPath}/${basePackage}/exception`,
      `${projectPath}/${resourcesPath}`,
      `${projectPath}/${testPath}/controller`,
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async generateFromTemplates(projectPath: string, data: any) {
    const templatesDir = path.join(__dirname, '../../templates/springboot');
    const { projectName, basePackage, dbName, classes, relations } = data;
    const className = this.capitalize(projectName.replace(/-/g, ''));

    // Generate pom.xml
    await this.renderTemplate(
      path.join(templatesDir, 'pom.xml.ejs'),
      path.join(projectPath, 'pom.xml'),
      { projectName }
    );

    // Generate Application.java
    const appPath = `src/main/java/${basePackage.replace(/\./g, '/')}/`;
    await this.renderTemplate(
      path.join(templatesDir, 'Application.java.ejs'),
      path.join(projectPath, appPath, `${className}Application.java`),
      { basePackage, className }
    );

    // Generate application.properties
    await this.renderTemplate(
      path.join(templatesDir, 'application.properties.ejs'),
      path.join(projectPath, 'src/main/resources/application.properties'),
      { projectName, dbName }
    );

    // Generate database.sql script
    await this.renderTemplate(
      path.join(templatesDir, 'database.sql.ejs'),
      path.join(projectPath, 'database.sql'),
      { projectName, dbName, classes, relations }
    );

    // Generate setup-database.bat script for automatic DB setup
    await this.renderTemplate(
      path.join(templatesDir, 'setup-database.bat.ejs'),
      path.join(projectPath, 'setup-database.bat'),
      { projectName, dbName, classes }
    );

    // Generate .env with default values
    await this.renderTemplate(
      path.join(templatesDir, '.env.ejs'),
      path.join(projectPath, '.env'),
      { projectName, dbName }
    );

    // Generate README.md
    await this.renderTemplate(
      path.join(templatesDir, 'README.md.ejs'),
      path.join(projectPath, 'README.md'),
      { projectName, basePackage, dbName, classes }
    );

    // Generate .gitignore
    await this.renderTemplate(
      path.join(templatesDir, '.gitignore.ejs'),
      path.join(projectPath, '.gitignore'),
      { projectName, dbName }
    );

    // Generate Endpoints.md
    await this.renderTemplate(
      path.join(templatesDir, 'Endpoints.md.ejs'),
      path.join(projectPath, 'Endpoints.md'),
      { projectName, classes }
    );

    // Generate exception handlers
    const exceptionPath = `src/main/java/${basePackage.replace(/\./g, '/')}/exception/`;
    await this.renderTemplate(
      path.join(templatesDir, 'GlobalExceptionHandler.java.ejs'),
      path.join(projectPath, exceptionPath, 'GlobalExceptionHandler.java'),
      { basePackage }
    );
    await this.renderTemplate(
      path.join(templatesDir, 'ResourceNotFoundException.java.ejs'),
      path.join(projectPath, exceptionPath, 'ResourceNotFoundException.java'),
      { basePackage }
    );

    // Generate for each class
    for (const cls of classes) {
      await this.generateClassFiles(projectPath, basePackage, cls);
    }
  }

  private async generateClassFiles(projectPath: string, basePackage: string, classData: any) {
    const templatesDir = path.join(__dirname, '../../templates/springboot');
    const basePath = basePackage.replace(/\./g, '/');

    const templateData = {
      basePackage,
      ...classData,
      capitalize: this.capitalize,
      idType: classData.idType || 'Long',
    };

    // Generate Entity
    await this.renderTemplate(
      path.join(templatesDir, 'Entity.java.ejs'),
      path.join(projectPath, `src/main/java/${basePath}/entity/${classData.className}.java`),
      templateData
    );

    // Generate DTO
    await this.renderTemplate(
      path.join(templatesDir, 'DTO.java.ejs'),
      path.join(projectPath, `src/main/java/${basePath}/dto/${classData.className}DTO.java`),
      templateData
    );

    // Generate Repository
    await this.renderTemplate(
      path.join(templatesDir, 'Repository.java.ejs'),
      path.join(projectPath, `src/main/java/${basePath}/repository/${classData.className}Repository.java`),
      templateData
    );

    // Generate Service
    await this.renderTemplate(
      path.join(templatesDir, 'Service.java.ejs'),
      path.join(projectPath, `src/main/java/${basePath}/service/${classData.className}Service.java`),
      templateData
    );

    // Generate Controller
    await this.renderTemplate(
      path.join(templatesDir, 'Controller.java.ejs'),
      path.join(projectPath, `src/main/java/${basePath}/controller/${classData.className}Controller.java`),
      templateData
    );

    // Generate Test
    await this.renderTemplate(
      path.join(templatesDir, 'ControllerTest.java.ejs'),
      path.join(projectPath, `src/test/java/${basePath}/controller/${classData.className}ControllerTest.java`),
      templateData
    );
  }

  private async renderTemplate(templatePath: string, outputPath: string, data: any) {
    const template = await fs.readFile(templatePath, 'utf-8');
    const rendered = ejs.render(template, data);
    await fs.writeFile(outputPath, rendered);
  }

  private async createZipFile(projectPath: string, zipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        console.log(`ZIP file created: ${archive.pointer()} total bytes`);
        resolve();
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.pipe(output);
      archive.directory(projectPath, false);
      archive.finalize();
    });
  }

  async downloadProject(generatedCodeId: string): Promise<string> {
    const generatedCode = await this.prisma.generatedCode.findUnique({
      where: { id: generatedCodeId },
    });

    if (!generatedCode) {
      throw new Error('Generated code not found');
    }

    return generatedCode.zipPath;
  }

  async getGeneratedProjects(userId: string) {
    return this.prisma.generatedCode.findMany({
      where: { generatedBy: userId },
      include: {
        diagram: {
          select: {
            name: true,
            id: true,
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  // ==================== FLUTTER GENERATION METHODS ====================

  private async createFlutterProjectStructure(projectPath: string, projectName: string) {
    const directories = [
      `${projectPath}/lib/config`,
      `${projectPath}/lib/models`,
      `${projectPath}/lib/services`,
      `${projectPath}/lib/screens`,
      `${projectPath}/lib/screens/home`,
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async generateFlutterFromTemplates(projectPath: string, data: any) {
    const templatesDir = path.join(__dirname, '../../templates/flutter');
    const { projectName, classes } = data;

    // Generate pubspec.yaml
    await this.renderTemplate(
      path.join(templatesDir, 'pubspec.yaml.ejs'),
      path.join(projectPath, 'pubspec.yaml'),
      { projectName }
    );

    // Generate main.dart
    await this.renderTemplate(
      path.join(templatesDir, 'main.dart.ejs'),
      path.join(projectPath, 'lib/main.dart'),
      { projectName }
    );

    // Generate api_config.dart
    await this.renderTemplate(
      path.join(templatesDir, 'api_config.dart.ejs'),
      path.join(projectPath, 'lib/config/api_config.dart'),
      {}
    );

    // Generate api_service.dart
    await this.renderTemplate(
      path.join(templatesDir, 'api_service.dart.ejs'),
      path.join(projectPath, 'lib/services/api_service.dart'),
      {}
    );

    // Generate home_screen.dart
    await this.renderTemplate(
      path.join(templatesDir, 'HomeScreen.dart.ejs'),
      path.join(projectPath, 'lib/screens/home_screen.dart'),
      { projectName, classes }
    );

    // Generate README.md
    await this.renderTemplate(
      path.join(templatesDir, 'README.md.ejs'),
      path.join(projectPath, 'README.md'),
      { projectName, classes }
    );

    // Generate .gitignore
    await this.renderTemplate(
      path.join(templatesDir, '.gitignore.ejs'),
      path.join(projectPath, '.gitignore'),
      {}
    );

    // Generate for each class
    for (const cls of classes) {
      await this.generateFlutterClassFiles(projectPath, cls);
    }
  }

  private async generateFlutterClassFiles(projectPath: string, classData: any) {
    const templatesDir = path.join(__dirname, '../../templates/flutter');
    const className = classData.className;
    const classNameLower = className.toLowerCase();

    // Create directory for this entity's screens
    await fs.mkdir(`${projectPath}/lib/screens/${classNameLower}`, { recursive: true });

    // Generate Model
    await this.renderTemplate(
      path.join(templatesDir, 'Model.dart.ejs'),
      path.join(projectPath, `lib/models/${classNameLower}.dart`),
      classData
    );

    // Generate Service
    await this.renderTemplate(
      path.join(templatesDir, 'Service.dart.ejs'),
      path.join(projectPath, `lib/services/${classNameLower}_service.dart`),
      classData
    );

    // Generate List Screen
    await this.renderTemplate(
      path.join(templatesDir, 'ListScreen.dart.ejs'),
      path.join(projectPath, `lib/screens/${classNameLower}/${classNameLower}_list_screen.dart`),
      classData
    );

    // Generate Form Screen
    await this.renderTemplate(
      path.join(templatesDir, 'FormScreen.dart.ejs'),
      path.join(projectPath, `lib/screens/${classNameLower}/${classNameLower}_form_screen.dart`),
      classData
    );
  }
}
