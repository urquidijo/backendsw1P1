import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as xml2js from 'xml2js';

@Injectable()
export class XmiExportService {
  constructor(private prisma: PrismaService) {}

  // ─────────────────────────────────────────────────
  // EXPORT: Diagram → XMI 2.1 (Enterprise Architect)
  // ─────────────────────────────────────────────────
  async exportToXmi(diagramId: string, userId: string): Promise<string> {
    const diagram = await this.getDiagramWithAccess(diagramId, userId);

    const data = (diagram.data as any) || {};
    const classes: any[] = data.classes || [];
    const relations: any[] = data.relations || [];

    const nowStr = new Date().toISOString();
    const pkgEaId = this.toEaGuid('EAPK_', `pkg_${diagramId}`);
    const modelEaId = this.toEaGuid('EAID_', `model_${diagramId}`);
    const diagEaId = this.toEaGuid('EAID_', `diag_${diagramId}`);

    // Map class IDs to EA format and DUIDs
    const classIdToEaId = new Map<string, string>();
    const classIdToDuid = new Map<string, string>();
    const classIdToLocalId = new Map<string, number>();
    const classIdToName = new Map<string, string>();

    classes.forEach((cls: any, index: number) => {
      const eaId = this.toEaGuid('EAID_');
      const duid = this.toDuid();
      classIdToEaId.set(cls.id, eaId);
      classIdToDuid.set(cls.id, duid);
      classIdToLocalId.set(cls.id, 300 + index);
      classIdToName.set(cls.id, cls.name || `Class${index + 1}`);
    });

    // Map relation IDs to EA format
    const validRelations = relations.filter(
      (r: any) => classIdToEaId.has(r.sourceClassId) && classIdToEaId.has(r.targetClassId),
    );

    const relIdToEaId = new Map<string, string>();
    const relIdToLocalId = new Map<string, number>();

    validRelations.forEach((rel: any, index: number) => {
      const key = rel.id || String(index);
      const eaId = this.toEaGuid('EAID_');
      relIdToEaId.set(key, eaId);
      relIdToLocalId.set(key, 600 + index);
    });

    // ── 1. PackagedElements: Classes ──────────────────────────────────────────
    const classElements = classes.map((cls: any) => {
      const classEaId = classIdToEaId.get(cls.id)!;

      const attributes = (cls.attributes || []).map((attr: any, aIdx: number) => {
        const attrEaId = this.toEaGuid('EAID_', `attr_${cls.id}_${attr.id || aIdx}`);
        const eaType = this.mapTypeToEa(attr.type);
        return {
          $: {
            'xmi:type': 'uml:Property',
            'xmi:id': attrEaId,
            name: attr.name || 'attribute',
            visibility: attr.visibility || 'private',
            isStatic: attr.isStatic ? 'true' : 'false',
            isReadOnly: 'false',
            isDerived: 'false',
            isOrdered: 'false',
            isUnique: 'true',
            isDerivedUnion: 'false',
          },
          lowerValue: [
            {
              $: {
                'xmi:type': 'uml:LiteralInteger',
                'xmi:id': this.toEaGuid('EAID_LI_', `lv_${attrEaId}`),
                value: '1',
              },
            },
          ],
          upperValue: [
            {
              $: {
                'xmi:type': 'uml:LiteralInteger',
                'xmi:id': this.toEaGuid('EAID_LI_', `uv_${attrEaId}`),
                value: '1',
              },
            },
          ],
          type: [{ $: { 'xmi:idref': eaType.idref } }],
        };
      });

      const methods = (cls.methods || []).map((method: any, mIdx: number) => {
        const opEaId = this.toEaGuid('EAID_', `op_${cls.id}_${method.id || mIdx}`);
        const params = (method.parameters || []).map((p: any, i: number) => ({
          $: {
            'xmi:type': 'uml:Parameter',
            'xmi:id': this.toEaGuid('EAID_', `param_${opEaId}_${i}`),
            name: p.name || `param${i}`,
            direction: 'in',
          },
        }));

        params.push({
          $: {
            'xmi:type': 'uml:Parameter',
            'xmi:id': this.toEaGuid('EAID_', `ret_${opEaId}`),
            name: 'return',
            direction: 'return',
          },
        });

        return {
          $: {
            'xmi:type': 'uml:Operation',
            'xmi:id': opEaId,
            name: method.name || 'operation',
            visibility: method.visibility || 'public',
            isStatic: method.isStatic ? 'true' : 'false',
          },
          ownedParameter: params,
        };
      });

      const isAbstract = cls.isAbstract || cls.stereotype === 'abstract';
      const isInterface = cls.stereotype === 'interface' || cls.type === 'interface';

      return {
        $: {
          'xmi:type': isInterface ? 'uml:Interface' : 'uml:Class',
          'xmi:id': classEaId,
          name: cls.name,
          visibility: 'public',
          isAbstract: isAbstract ? 'true' : 'false',
        },
        ownedAttribute: attributes,
        ownedOperation: methods,
      };
    });

    // ── 2. PackagedElements: Relations / Associations ─────────────────────────
    const relationElements: any[] = [];
    for (const rel of validRelations) {
      const relKey = rel.id || validRelations.indexOf(rel);
      const relEaId = relIdToEaId.get(String(relKey))!;
      const srcClassEaId = classIdToEaId.get(rel.sourceClassId)!;
      const tgtClassEaId = classIdToEaId.get(rel.targetClassId)!;
      const srcMult = this.parseMultToEa(rel.sourceMultiplicity);
      const tgtMult = this.parseMultToEa(rel.targetMultiplicity);
      const relType = rel.type || 'ASSOCIATION';

      if (relType === 'INHERITANCE') {
        relationElements.push({
          $: {
            'xmi:type': 'uml:Generalization',
            'xmi:id': relEaId,
            specific: srcClassEaId,
            general: tgtClassEaId,
          },
        });
      } else if (relType === 'REALIZATION') {
        relationElements.push({
          $: {
            'xmi:type': 'uml:Realization',
            'xmi:id': relEaId,
            name: rel.name || '',
            client: srcClassEaId,
            supplier: tgtClassEaId,
          },
        });
      } else if (relType === 'DEPENDENCY') {
        relationElements.push({
          $: {
            'xmi:type': 'uml:Dependency',
            'xmi:id': relEaId,
            name: rel.name || '',
            client: srcClassEaId,
            supplier: tgtClassEaId,
          },
        });
      } else {
        const aggregation = relType === 'COMPOSITION' ? 'composite' : relType === 'AGGREGATION' ? 'shared' : 'none';
        const dstEndId = this.toEaGuid('EAID_dst_', relEaId);
        const srcEndId = this.toEaGuid('EAID_src_', relEaId);

        relationElements.push({
          $: {
            'xmi:type': 'uml:Association',
            'xmi:id': relEaId,
            name: rel.name || '',
            visibility: 'public',
          },
          memberEnd: [
            { $: { 'xmi:idref': dstEndId } },
            { $: { 'xmi:idref': srcEndId } },
          ],
          ownedEnd: [
            {
              $: {
                'xmi:type': 'uml:Property',
                'xmi:id': dstEndId,
                visibility: 'public',
                association: relEaId,
                isStatic: 'false',
                isReadOnly: 'true',
                isDerived: 'false',
                isOrdered: 'false',
                isUnique: 'true',
                isDerivedUnion: 'false',
                aggregation,
              },
              type: [{ $: { 'xmi:idref': tgtClassEaId } }],
              lowerValue: [
                {
                  $: {
                    'xmi:type': 'uml:LiteralInteger',
                    'xmi:id': this.toEaGuid('EAID_LI_', `${dstEndId}_1`),
                    value: tgtMult.lower,
                  },
                },
              ],
              upperValue: [
                {
                  $: {
                    'xmi:type': tgtMult.upper === '-1' ? 'uml:LiteralUnlimitedNatural' : 'uml:LiteralInteger',
                    'xmi:id': this.toEaGuid('EAID_LI_', `${dstEndId}_2`),
                    value: tgtMult.upper,
                  },
                },
              ],
            },
            {
              $: {
                'xmi:type': 'uml:Property',
                'xmi:id': srcEndId,
                visibility: 'public',
                association: relEaId,
                isStatic: 'false',
                isReadOnly: 'true',
                isDerived: 'false',
                isOrdered: 'false',
                isUnique: 'true',
                isDerivedUnion: 'false',
                aggregation: 'none',
              },
              type: [{ $: { 'xmi:idref': srcClassEaId } }],
              lowerValue: [
                {
                  $: {
                    'xmi:type': 'uml:LiteralInteger',
                    'xmi:id': this.toEaGuid('EAID_LI_', `${srcEndId}_1`),
                    value: srcMult.lower,
                  },
                },
              ],
              upperValue: [
                {
                  $: {
                    'xmi:type': srcMult.upper === '-1' ? 'uml:LiteralUnlimitedNatural' : 'uml:LiteralInteger',
                    'xmi:id': this.toEaGuid('EAID_LI_', `${srcEndId}_2`),
                    value: srcMult.upper,
                  },
                },
              ],
            },
          ],
        });
      }
    }

    // ── 3. xmi:Extension > elements (Package & Classes) ──────────────────────
    const extensionElements: any[] = [
      {
        $: {
          'xmi:idref': pkgEaId,
          'xmi:type': 'uml:Package',
          name: diagram.name,
          scope: 'public',
        },
        model: [{ $: { package: pkgEaId, ea_eleType: 'package' } }],
        properties: [{ $: { isSpecification: 'false', sType: 'Package', scope: 'public' } }],
        project: [{ $: { author: 'UML Platform', phase: '1.0', created: nowStr, modified: nowStr, status: 'Proposed' } }],
      },
      ...classes.map((cls: any) => {
        const classEaId = classIdToEaId.get(cls.id)!;
        const localId = classIdToLocalId.get(cls.id)!;

        // Association links for this class
        const linksList: any[] = [];
        for (const rel of validRelations) {
          if (rel.sourceClassId === cls.id || rel.targetClassId === cls.id) {
            const relKey = rel.id || validRelations.indexOf(rel);
            const relEaId = relIdToEaId.get(String(relKey))!;
            const sId = classIdToEaId.get(rel.sourceClassId)!;
            const tId = classIdToEaId.get(rel.targetClassId)!;
            linksList.push({
              Association: [
                {
                  $: {
                    'xmi:id': relEaId,
                    start: sId,
                    end: tId,
                  },
                },
              ],
            });
          }
        }

        const attrElements = (cls.attributes || []).map((attr: any, aIdx: number) => {
          const attrEaId = this.toEaGuid('EAID_', `attr_${cls.id}_${attr.id || aIdx}`);
          const eaType = this.mapTypeToEa(attr.type);
          return {
            $: {
              'xmi:idref': attrEaId,
              name: attr.name || 'attribute',
              scope: attr.visibility === 'public' ? 'Public' : 'Private',
            },
            model: [{ $: { ea_localid: String(localId * 10 + aIdx), ea_guid: `{${attrEaId.replace('EAID_', '')}}` } }],
            properties: [
              {
                $: {
                  type: eaType.name,
                  derived: '0',
                  collection: 'false',
                  static: attr.isStatic ? '1' : '0',
                  duplicates: '0',
                  changeability: 'changeable',
                },
              },
            ],
            bounds: [{ $: { lower: '1', upper: '1' } }],
          };
        });

        const elemObj: any = {
          $: {
            'xmi:idref': classEaId,
            'xmi:type': 'uml:Class',
            name: cls.name,
            scope: 'public',
          },
          model: [{ $: { package: pkgEaId, ea_localid: String(localId), ea_eleType: 'element' } }],
          properties: [
            {
              $: {
                isSpecification: 'false',
                sType: 'Class',
                nType: '0',
                scope: 'public',
                isRoot: 'false',
                isLeaf: 'false',
                isAbstract: cls.isAbstract ? 'true' : 'false',
                isActive: 'false',
              },
            },
          ],
          project: [
            {
              $: {
                author: 'UML Platform',
                version: '1.0',
                phase: '1.0',
                created: nowStr,
                modified: nowStr,
                status: 'Proposed',
              },
            },
          ],
        };

        if (attrElements.length > 0) {
          elemObj.attributes = [{ attribute: attrElements }];
        }
        if (linksList.length > 0) {
          elemObj.links = linksList;
        }

        return elemObj;
      }),
    ];

    // ── 4. xmi:Extension > connectors (Crucial for EA relationships) ─────────
    const extensionConnectors = validRelations.map((rel: any, relIdx: number) => {
      const relKey = rel.id || relIdx;
      const relEaId = relIdToEaId.get(String(relKey))!;
      const relLocalId = relIdToLocalId.get(String(relKey))!;
      const srcClassEaId = classIdToEaId.get(rel.sourceClassId)!;
      const tgtClassEaId = classIdToEaId.get(rel.targetClassId)!;
      const srcLocalId = classIdToLocalId.get(rel.sourceClassId)!;
      const tgtLocalId = classIdToLocalId.get(rel.targetClassId)!;
      const srcName = classIdToName.get(rel.sourceClassId) || '';
      const tgtName = classIdToName.get(rel.targetClassId) || '';
      const srcMult = this.parseMultToEa(rel.sourceMultiplicity);
      const tgtMult = this.parseMultToEa(rel.targetMultiplicity);
      const relType = rel.type || 'ASSOCIATION';

      let eaType = 'Association';
      let direction = 'Unspecified';
      let targetAggregation = 'none';

      if (relType === 'INHERITANCE') {
        eaType = 'Generalization';
        direction = 'Source -> Destination';
      } else if (relType === 'REALIZATION') {
        eaType = 'Realisation';
        direction = 'Source -> Destination';
      } else if (relType === 'DEPENDENCY') {
        eaType = 'Dependency';
        direction = 'Source -> Destination';
      } else if (relType === 'COMPOSITION') {
        eaType = 'Association';
        targetAggregation = 'composite';
      } else if (relType === 'AGGREGATION') {
        eaType = 'Association';
        targetAggregation = 'shared';
      }

      return {
        $: {
          'xmi:idref': relEaId,
          name: rel.name || '',
        },
        source: [
          {
            $: { 'xmi:idref': srcClassEaId },
            model: [{ $: { ea_localid: String(srcLocalId), type: 'Class', name: srcName } }],
            role: [{ $: { visibility: 'Public' } }],
            type: [{ $: { multiplicity: srcMult.label, aggregation: 'none' } }],
            modifiers: [{ $: { isOrdered: 'false', isNavigable: 'false' } }],
            style: [{ $: { value: 'Navigable=Unspecified;Owned=0;' } }],
          },
        ],
        target: [
          {
            $: { 'xmi:idref': tgtClassEaId },
            model: [{ $: { ea_localid: String(tgtLocalId), type: 'Class', name: tgtName } }],
            role: [{ $: { visibility: 'Public' } }],
            type: [{ $: { multiplicity: tgtMult.label, aggregation: targetAggregation } }],
            modifiers: [{ $: { isOrdered: 'false', isNavigable: 'false' } }],
            style: [{ $: { value: 'Navigable=Unspecified;Owned=0;' } }],
          },
        ],
        model: [{ $: { ea_localid: String(relLocalId) } }],
        properties: [{ $: { ea_type: eaType, direction } }],
        modifiers: [{ $: { isRoot: 'false', isLeaf: 'false' } }],
        appearance: [{ $: { linemode: '3', linecolor: '-1', linewidth: '0', seqno: '0', headStyle: '0', lineStyle: '0' } }],
        labels: [{ $: { lb: srcMult.label, mt: rel.name || '', rb: tgtMult.label } }],
      };
    });

    // ── 5. xmi:Extension > diagrams > diagram > elements ──────────────────────
    // Includes BOTH:
    // - Class box geometry (Left, Top, Right, Bottom) with DUID
    // - Connector EDGE geometry with SOID (source DUID) and EOID (target DUID)
    const diagramElements: any[] = [
      ...classes.map((cls: any, idx: number) => {
        const classEaId = classIdToEaId.get(cls.id)!;
        const duid = classIdToDuid.get(cls.id)!;
        const pos = cls.position || { x: 80 + (idx % 3) * 280, y: 60 + Math.floor(idx / 3) * 220 };
        const w = 160;
        const h = 70 + (cls.attributes?.length || 0) * 18 + (cls.methods?.length || 0) * 18;
        return {
          $: {
            geometry: `Left=${pos.x};Top=${pos.y};Right=${pos.x + w};Bottom=${pos.y + h};`,
            subject: classEaId,
            seqno: String(idx + 1),
            style: `DUID=${duid};`,
          },
        };
      }),
      ...validRelations.map((rel: any, idx: number) => {
        const relKey = rel.id || idx;
        const relEaId = relIdToEaId.get(String(relKey))!;
        const srcDuid = classIdToDuid.get(rel.sourceClassId)!;
        const tgtDuid = classIdToDuid.get(rel.targetClassId)!;
        return {
          $: {
            geometry: `EDGE=2;$LLB=CX=17:CY=14:OX=0:OY=0:HDN=0:BLD=0:ITA=0:UND=0:CLR=-1:ALN=1:DIR=0:ROT=0;LLT=;LMT=;LMB=;LRT=;LRB=CX=17:CY=14:OX=0:OY=0:HDN=0:BLD=0:ITA=0:UND=0:CLR=-1:ALN=1:DIR=0:ROT=0;IRHS=;ILHS=;Path=;`,
            subject: relEaId,
            style: `Mode=3;EOID=${tgtDuid};SOID=${srcDuid};Color=-1;LWidth=0;Hidden=0;`,
          },
        };
      }),
    ];

    // ── 6. Assemble complete XMI 2.1 Object ──────────────────────────────────
    const xmiObject = {
      'xmi:XMI': {
        $: {
          'xmi:version': '2.1',
          'xmlns:uml': 'http://schema.omg.org/spec/UML/2.1',
          'xmlns:xmi': 'http://schema.omg.org/spec/XMI/2.1',
        },
        'xmi:Documentation': [
          {
            $: {
              exporter: 'Enterprise Architect',
              exporterVersion: '6.5',
            },
          },
        ],
        'uml:Model': [
          {
            $: {
              'xmi:type': 'uml:Model',
              'xmi:id': modelEaId,
              name: 'EA_Model',
              visibility: 'public',
            },
            packagedElement: [
              {
                $: {
                  'xmi:type': 'uml:Package',
                  'xmi:id': pkgEaId,
                  name: diagram.name,
                  visibility: 'public',
                },
                packagedElement: [...classElements, ...relationElements],
              },
            ],
          },
        ],
        'xmi:Extension': [
          {
            $: {
              extender: 'Enterprise Architect',
              extenderID: '6.5',
            },
            elements: [
              {
                element: extensionElements,
              },
            ],
            connectors: [
              {
                connector: extensionConnectors,
              },
            ],
            primitivetypes: [
              {
                packagedElement: [
                  {
                    $: {
                      'xmi:type': 'uml:Package',
                      'xmi:id': 'EAPrimitiveTypesPackage',
                      name: 'EA_PrimitiveTypes_Package',
                      visibility: 'public',
                    },
                    packagedElement: [
                      {
                        $: {
                          'xmi:type': 'uml:Package',
                          'xmi:id': 'EAJavaTypesPackage',
                          name: 'EA_Java_Types_Package',
                          visibility: 'public',
                        },
                        packagedElement: [
                          {
                            $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_int', name: 'int', visibility: 'public' },
                            generalization: [{ $: { 'xmi:type': 'uml:Generalization', 'xmi:id': 'EAJava_int_General' }, general: [{ $: { href: 'http://schema.omg.org/spec/UML/2.1/uml.xml#Integer' } }] }],
                          },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_date', name: 'date', visibility: 'public' } },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_string', name: 'string', visibility: 'public' } },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_datetime', name: 'datetime', visibility: 'public' } },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_boolean', name: 'boolean', visibility: 'public' } },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_float', name: 'float', visibility: 'public' } },
                          { $: { 'xmi:type': 'uml:PrimitiveType', 'xmi:id': 'EAJava_void', name: 'void', visibility: 'public' } },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
            diagrams: [
              {
                diagram: [
                  {
                    $: { 'xmi:id': diagEaId },
                    model: [{ $: { package: pkgEaId, localID: '1', owner: pkgEaId } }],
                    properties: [{ $: { name: diagram.name, type: 'Logical' } }],
                    project: [{ $: { author: 'UML Platform', version: '1.0', created: nowStr, modified: nowStr } }],
                    style1: [{ $: { value: 'ShowPrivate=1;ShowProtected=1;ShowPublic=1;HideRelationships=0;Locked=0;Border=1;PackageContents=1;ConnectorNotation=UML 2.1;ShowIcons=1;ShowDetails=0;' } }],
                    style2: [{ $: { value: 'ExcludeRTF=0;DocAll=0;HideQuals=0;AttPkg=1;SuppressFOC=1;ConnectorNotation=UML 2.1;AdvancedElementProps=1;AdvancedFeatureProps=1;AdvancedConnectorProps=1;' } }],
                    elements: [
                      {
                        element: diagramElements,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const builder = new xml2js.Builder({
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    });

    return builder.buildObject(xmiObject);
  }

  // ─────────────────────────────────────────────────
  // IMPORT: XMI (Enterprise Architect) → Diagram
  // ─────────────────────────────────────────────────
  async importFromXmi(
    xmiContent: string,
    workspaceId: string,
    diagramName: string,
    userId: string,
  ): Promise<any> {
    let parsed: any;
    try {
      parsed = await xml2js.parseStringPromise(xmiContent, {
        explicitArray: true,
        mergeAttrs: false,
      });
    } catch (e) {
      throw new BadRequestException('El archivo XMI no es un XML válido: ' + e.message);
    }

    const xmiRoot = parsed['xmi:XMI'];
    if (!xmiRoot) {
      throw new BadRequestException('El archivo no tiene el formato XMI esperado (falta xmi:XMI)');
    }

    const umlModels = xmiRoot['uml:Model'];
    if (!umlModels || umlModels.length === 0) {
      throw new BadRequestException('No se encontró uml:Model en el XMI');
    }
    const umlModel = umlModels[0];
    const modelName = umlModel.$?.name || diagramName;

    await this.verifyWorkspaceAccess(workspaceId, userId);

    // ── Step 1: Build attribute type map from xmi:Extension ──────────────────
    // EA stores readable types (int, string, date…) in:
    // xmi:Extension > elements > element > attributes > attribute > properties @type
    const attrTypeMap = new Map<string, string>(); // xmi:id → type string
    const extensionArr: any[] = xmiRoot['xmi:Extension'] || [];
    for (const ext of extensionArr) {
      const elementsWrap: any[] = ext['elements'] || [];
      for (const elWrap of elementsWrap) {
        const elements: any[] = elWrap['element'] || [];
        for (const elem of elements) {
          const attrsWrap: any[] = elem['attributes'] || [];
          for (const attrWrap of attrsWrap) {
            const attrs: any[] = attrWrap['attribute'] || [];
            for (const attr of attrs) {
              const xmiId: string = attr.$?.['xmi:idref'];
              const typeProp: string = attr['properties']?.[0]?.$?.type;
              if (xmiId && typeProp) attrTypeMap.set(xmiId, typeProp);
            }
          }
        }
      }
    }

    // ── Step 2: Collect all packagedElements ─────────────────────────────────
    const allElements = this.collectPackagedElements(umlModel);

    // EA class types: Class, Interface, AssociationClass (join table as class)
    const CLASS_TYPES = new Set(['uml:Class', 'uml:Interface', 'uml:AssociationClass']);
    const classMap = new Map<string, any>(); // xmi:id → element node
    for (const el of allElements) {
      const type: string = el.$?.['xmi:type'];
      const id: string = el.$?.['xmi:id'];
      if (type && id && CLASS_TYPES.has(type)) classMap.set(id, el);
    }

    // ── Step 3: Build classes ─────────────────────────────────────────────────
    const classes: any[] = [];
    const idToLocalId = new Map<string, string>();
    let col = 0;

    for (const [xmiId, cls] of classMap) {
      const localId = this.randomId();
      idToLocalId.set(xmiId, localId);

      const isInterface = cls.$?.['xmi:type'] === 'uml:Interface';
      const isAbstract = cls.$?.isAbstract === 'true';
      const isAssocClass = cls.$?.['xmi:type'] === 'uml:AssociationClass';

      classes.push({
        id: localId,
        name: cls.$?.name || 'UnnamedClass',
        stereotype: isInterface ? 'interface' : isAbstract ? 'abstract' : isAssocClass ? 'associationClass' : undefined,
        isAbstract,
        position: { x: 100 + (col % 3) * 300, y: 100 + Math.floor(col / 3) * 260 },
        attributes: this.parseEAOwnedAttributes(cls, attrTypeMap),
        methods: this.parseOwnedOperations(cls),
      });
      col++;
    }

    // ── Step 4: Build relations from xmi:Extension > connectors ──────────────
    const relations: any[] = [];
    const seenRelIds = new Set<string>();

    for (const ext of extensionArr) {
      const connectorsWrap: any[] = ext['connectors'] || [];
      for (const connWrap of connectorsWrap) {
        const connectors: any[] = connWrap['connector'] || [];
        for (const conn of connectors) {
          const connXmiId: string = conn.$?.['xmi:idref'];
          if (!connXmiId || seenRelIds.has(connXmiId)) continue;
          seenRelIds.add(connXmiId);

          const eaType: string = conn['properties']?.[0]?.$?.ea_type || 'Association';
          const sourceEl = conn['source']?.[0];
          const targetEl = conn['target']?.[0];
          if (!sourceEl || !targetEl) continue;

          const srcXmiId: string = sourceEl.$?.['xmi:idref'];
          const tgtXmiId: string = targetEl.$?.['xmi:idref'];
          const srcLocalId = idToLocalId.get(srcXmiId);
          const tgtLocalId = idToLocalId.get(tgtXmiId);
          if (!srcLocalId || !tgtLocalId) continue;

          const srcMult: string | undefined = sourceEl['type']?.[0]?.$?.multiplicity;
          const tgtMult: string | undefined = targetEl['type']?.[0]?.$?.multiplicity;
          const srcAggr: string = sourceEl['type']?.[0]?.$?.aggregation || 'none';
          const tgtAggr: string = targetEl['type']?.[0]?.$?.aggregation || 'none';
          const connName: string | undefined = conn['labels']?.[0]?.$?.mt?.trim() || conn.$?.name;

          // ── Check if this connector is an AssociationClass connector ────────
          // EA sets extendedProperties.associationclass to the xmi:id of the
          // association class (e.g. "asignacion", "rutina_ejercicio").
          // In that case we create TWO relations: source→assocClass and assocClass→target
          // instead of a direct source→target, so the class is not floating.
          const assocClassXmiId: string | undefined =
            conn['extendedProperties']?.[0]?.$?.associationclass;

          if (assocClassXmiId) {
            const assocLocalId = idToLocalId.get(assocClassXmiId);
            if (assocLocalId) {
              // source → assocClass
              relations.push({
                id: this.randomId(),
                type: 'ASSOCIATION',
                sourceClassId: srcLocalId,
                targetClassId: assocLocalId,
                sourceMultiplicity: srcMult,
                targetMultiplicity: '1',
              });
              // assocClass → target
              relations.push({
                id: this.randomId(),
                type: 'ASSOCIATION',
                sourceClassId: assocLocalId,
                targetClassId: tgtLocalId,
                sourceMultiplicity: '1',
                targetMultiplicity: tgtMult,
              });
              continue; // skip the normal source→target relation
            }
          }

          // ── Regular connector ─────────────────────────────────────────────
          let relType = 'ASSOCIATION';
          if (eaType === 'Generalization') relType = 'INHERITANCE';
          else if (eaType === 'Realisation' || eaType === 'Realization') relType = 'REALIZATION';
          else if (eaType === 'Dependency') relType = 'DEPENDENCY';
          else if (srcAggr === 'composite' || tgtAggr === 'composite') relType = 'COMPOSITION';
          else if (srcAggr === 'shared' || tgtAggr === 'shared') relType = 'AGGREGATION';

          relations.push({
            id: this.randomId(),
            type: relType,
            sourceClassId: srcLocalId,
            targetClassId: tgtLocalId,
            name: connName && connName !== '' ? connName : undefined,
            sourceMultiplicity: srcMult,
            targetMultiplicity: tgtMult,
          });
        }
      }
    }


    // Fallback: parse packagedElement associations if connectors section is empty
    if (relations.length === 0) {
      for (const el of allElements) {
        const type: string = el.$?.['xmi:type'];
        const relId = this.randomId();
        if (type === 'uml:Generalization') {
          const srcId = idToLocalId.get(el.$?.specific);
          const tgtId = idToLocalId.get(el.$?.general);
          if (srcId && tgtId) relations.push({ id: relId, type: 'INHERITANCE', sourceClassId: srcId, targetClassId: tgtId });
        } else if (type === 'uml:Realization') {
          const srcId = idToLocalId.get(el.$?.client);
          const tgtId = idToLocalId.get(el.$?.supplier);
          if (srcId && tgtId) relations.push({ id: relId, type: 'REALIZATION', sourceClassId: srcId, targetClassId: tgtId });
        } else if (type === 'uml:Association') {
          const ends: any[] = el.ownedEnd || [];
          if (ends.length >= 2) {
            const s = ends[0].type?.[0]?.$?.['xmi:idref'] || ends[0].$?.type;
            const t = ends[1].type?.[0]?.$?.['xmi:idref'] || ends[1].$?.type;
            const srcId = idToLocalId.get(s);
            const tgtId = idToLocalId.get(t);
            if (srcId && tgtId) {
              const agg = ends[0].$?.aggregation;
              const rt = agg === 'composite' ? 'COMPOSITION' : agg === 'shared' ? 'AGGREGATION' : 'ASSOCIATION';
              relations.push({ id: relId, type: rt, sourceClassId: srcId, targetClassId: tgtId });
            }
          }
        }
      }
    }

    // ── Step 5: Persist diagram ───────────────────────────────────────────────
    const newDiagram = await this.prisma.diagram.create({
      data: {
        name: diagramName || modelName,
        workspaceId,
        data: {
          classes,
          relations,
          metadata: {
            importedFrom: 'EA-XMI',
            importedAt: new Date().toISOString(),
            importedBy: userId,
          },
        },
      },
    });

    return {
      message: 'Diagrama importado exitosamente desde XMI',
      diagram: newDiagram,
      stats: { classesImported: classes.length, relationsImported: relations.length },
    };
  }

  // ─────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────

  private collectPackagedElements(node: any): any[] {
    const results: any[] = [];
    if (!node) return results;
    for (const el of node.packagedElement || []) {
      results.push(el);
      const t: string = el.$?.['xmi:type'];
      if (t === 'uml:Package' || t === 'uml:Model') {
        results.push(...this.collectPackagedElements(el));
      }
    }
    return results;
  }

  /** Parse ownedAttributes using EA extension type map for accurate types */
  private parseEAOwnedAttributes(cls: any, attrTypeMap: Map<string, string>): any[] {
    return (cls.ownedAttribute || [])
      .filter((a: any) => !a.$?.association) // skip association ends
      .map((attr: any, i: number) => {
        const xmiId: string = attr.$?.['xmi:id'];
        const typeName = (xmiId ? attrTypeMap.get(xmiId) : undefined) || this.resolveEATypeName(attr);
        return {
          id: this.randomId(),
          name: attr.$?.name || `attr${i}`,
          type: typeName,
          visibility: attr.$?.visibility || 'private',
          nullable: !(attr.lowerValue?.[0]?.$?.value === '1'),
          unique: attr.$?.isUnique === 'true',
          isStatic: attr.$?.isStatic === 'true',
          multiplicity: this.parseMultiplicity(attr),
        };
      });
  }

  private parseOwnedOperations(cls: any): any[] {
    return (cls.ownedOperation || []).map((op: any, i: number) => {
      const params = (op.ownedParameter || [])
        .filter((p: any) => p.$?.direction !== 'return')
        .map((p: any) => ({ name: p.$?.name || 'param', type: this.resolveEATypeName(p) }));
      const ret = (op.ownedParameter || []).find((p: any) => p.$?.direction === 'return');
      return {
        id: this.randomId(),
        name: op.$?.name || `method${i}`,
        returnType: ret ? this.resolveEATypeName(ret) : 'void',
        visibility: op.$?.visibility || 'public',
        isStatic: op.$?.isStatic === 'true',
        parameters: params,
      };
    });
  }

  /** Resolve EA primitive type from <type xmi:idref="EAJava_int"/> */
  private resolveEATypeName(node: any): string {
    const map: Record<string, string> = {
      EAJava_int: 'int', EAJava_integer: 'int', EAJava_long: 'long',
      EAJava_float: 'float', EAJava_double: 'double', EAJava_boolean: 'boolean',
      EAJava_char: 'char', EAJava_byte: 'byte', EAJava_short: 'short',
      EAJava_string: 'String', EAJava_String: 'String',
      EAJava_date: 'Date', EAJava_datetime: 'DateTime', EAJava_time: 'Time',
      EAJava_void: 'void',
    };
    const idref: string | undefined = node.type?.[0]?.$?.['xmi:idref'];
    if (idref) {
      if (map[idref]) return map[idref];
      if (idref.startsWith('EAJava_')) return idref.replace('EAJava_', '');
      if (idref.startsWith('primitivetype_')) return idref.replace('primitivetype_', '');
      return idref;
    }
    if (node.type?.[0]?._) return node.type[0]._;
    const typeAttr: string | undefined = node.$?.type;
    if (typeAttr) {
      if (map[typeAttr]) return map[typeAttr];
      if (typeAttr.startsWith('EAJava_')) return typeAttr.replace('EAJava_', '');
      return typeAttr;
    }
    return 'String';
  }

  private parseMultiplicity(node: any): string | undefined {
    const lower: string | undefined = node.lowerValue?.[0]?.$?.value;
    const upper: string | undefined = node.upperValue?.[0]?.$?.value;
    if (!lower && !upper) return undefined;
    const lo = lower ?? '0';
    const hi = upper === '-1' ? '*' : (upper ?? '1'); // EA uses -1 for unlimited (*)
    return `${lo}..${hi}`;
  }

  private mapRelationType(type: string): string {
    const map: Record<string, string> = {
      ASSOCIATION: 'uml:Association',
      COMPOSITION: 'uml:Association_Composition',
      AGGREGATION: 'uml:Association_Aggregation',
      INHERITANCE: 'uml:Generalization',
      REALIZATION: 'uml:Realization',
      DEPENDENCY: 'uml:Dependency',
    };
    return map[type] || 'uml:Association';
  }

  private randomId(): string {
    return Math.random().toString(36).substring(2, 11);
  }

  private randomHex(length: number): string {
    const chars = '0123456789ABCDEF';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
    return result;
  }

  private toEaGuid(prefix: string, _seed?: string): string {
    const hex = this.randomHex(32);
    return `${prefix}${hex.substring(0, 8)}_${hex.substring(8, 12)}_${hex.substring(12, 16)}_${hex.substring(16, 20)}_${hex.substring(20, 32)}`;
  }

  private toDuid(): string {
    return this.randomHex(8);
  }

  private mapTypeToEa(type?: string): { idref: string; name: string } {
    if (!type) return { idref: 'EAJava_string', name: 'string' };
    const t = type.toLowerCase();
    if (t.includes('int') || t.includes('number')) return { idref: 'EAJava_int', name: 'int' };
    if (t.includes('datetime') || t.includes('timestamp')) return { idref: 'EAJava_datetime', name: 'datetime' };
    if (t.includes('date')) return { idref: 'EAJava_date', name: 'date' };
    if (t.includes('bool')) return { idref: 'EAJava_boolean', name: 'boolean' };
    if (t.includes('float') || t.includes('decimal') || t.includes('double')) return { idref: 'EAJava_float', name: 'float' };
    if (t.includes('void')) return { idref: 'EAJava_void', name: 'void' };
    return { idref: 'EAJava_string', name: 'string' };
  }

  private parseMultToEa(mult?: string): { lower: string; upper: string; label: string } {
    if (!mult || mult.trim() === '') return { lower: '0', upper: '-1', label: '0..*' };
    const m = mult.trim();
    if (m === '*') return { lower: '0', upper: '-1', label: '*' };
    if (m === '1') return { lower: '1', upper: '1', label: '1' };
    if (m === '0..1') return { lower: '0', upper: '1', label: '0..1' };
    if (m === '1..*') return { lower: '1', upper: '-1', label: '1..*' };
    if (m === '0..*') return { lower: '0', upper: '-1', label: '0..*' };
    const parts = m.split('..');
    if (parts.length === 2) {
      const lo = parts[0].trim();
      const hi = parts[1].trim() === '*' ? '-1' : parts[1].trim();
      return { lower: lo, upper: hi, label: m };
    }
    return { lower: '1', upper: '1', label: m };
  }

  private async getDiagramWithAccess(diagramId: string, userId: string) {
    const diagram = await this.prisma.diagram.findUnique({
      where: { id: diagramId },
      include: { workspace: { include: { collaborators: true } } },
    });
    if (!diagram) throw new NotFoundException('Diagrama no encontrado');
    const hasAccess =
      diagram.workspace.ownerId === userId ||
      diagram.workspace.collaborators.some((c) => c.userId === userId);
    if (!hasAccess) throw new ForbiddenException('Sin acceso a este diagrama');
    return diagram;
  }

  private async verifyWorkspaceAccess(workspaceId: string, userId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { collaborators: true },
    });
    if (!workspace) throw new NotFoundException('Workspace no encontrado');
    const hasAccess =
      workspace.ownerId === userId ||
      workspace.collaborators.some((c) => c.userId === userId);
    if (!hasAccess) throw new ForbiddenException('Sin acceso a este workspace');
    return workspace;
  }
}
