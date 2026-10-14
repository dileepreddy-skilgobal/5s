import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service';
import * as XLSX from 'xlsx';

export interface LocationImportRow {
  areaCode: string;
  name: string;
  locationType: string;
  orgNodeCode: string;
  riskLevel?: string;
  auditFrequency?: string;
  building?: string;
  floor?: string;
  description?: string;
  ownerEmail?: string;
}

export interface ImportError {
  rowNumber: number;
  field: string;
  value: any;
  message: string;
}

export interface DryRunResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: ImportError[];
  parsedData: LocationImportRow[];
}

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  generateLocationTemplate(): Buffer {
    const headers = [
      'AreaCode',
      'Name',
      'LocationType',
      'OrgNodeCode',
      'RiskLevel',
      'AuditFrequency',
      'Building',
      'Floor',
      'Description',
      'OwnerEmail',
    ];

    const sampleRows = [
      [
        'LOC-BLR-P1-ASM01',
        'Main Assembly Station 1',
        'PRODUCTION_LINE',
        'PLANT-01-DEPT-01',
        'LOW',
        'WEEKLY',
        'Building A',
        'Ground Floor',
        'Automated chassis assembly cell',
        'admin@skilglobal.com',
      ],
      [
        'LOC-BLR-P1-WH02',
        'Finished Goods Racks A1-A4',
        'WAREHOUSE_BAY',
        'PLANT-01-DEPT-02',
        'MEDIUM',
        'MONTHLY',
        'Warehouse 1',
        'Level 1',
        'High-density pallet rack staging',
        'supervisor@skilglobal.com',
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Locations_Master_Template');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  async validateLocationsDryRun(tenantId: string, rows: LocationImportRow[]): Promise<DryRunResult> {
    const errors: ImportError[] = [];
    const validRows: LocationImportRow[] = [];

    // Pre-fetch existing area codes and org nodes in tenant
    const existingLocations = await this.prisma.location.findMany({
      where: { tenantId },
      select: { areaCode: true },
    });
    const existingAreaCodes = new Set(existingLocations.map((l) => l.areaCode.toUpperCase()));

    const orgNodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const orgNodeMap = new Map(orgNodes.map((n) => [n.code.toUpperCase(), n.id]));

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    const allowedTypes = ['PRODUCTION_LINE', 'WAREHOUSE_BAY', 'OFFICE_FLOOR', 'LABORATORY', 'RED_TAG_ZONE', 'WORKSHOP', 'UTILITY'];
    const allowedRisks = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const allowedFreqs = ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY'];

    const fileAreaCodesSeen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Accounting for 1-based index + header row

      let hasRowError = false;

      // 1. AreaCode validation
      if (!row.areaCode || row.areaCode.trim().length === 0) {
        errors.push({ rowNumber: rowNum, field: 'AreaCode', value: row.areaCode, message: 'AreaCode is required.' });
        hasRowError = true;
      } else {
        const upperCode = row.areaCode.trim().toUpperCase();
        if (existingAreaCodes.has(upperCode)) {
          errors.push({ rowNumber: rowNum, field: 'AreaCode', value: row.areaCode, message: `AreaCode '${row.areaCode}' already exists in the system.` });
          hasRowError = true;
        } else if (fileAreaCodesSeen.has(upperCode)) {
          errors.push({ rowNumber: rowNum, field: 'AreaCode', value: row.areaCode, message: `Duplicate AreaCode '${row.areaCode}' inside this spreadsheet.` });
          hasRowError = true;
        } else {
          fileAreaCodesSeen.add(upperCode);
        }
      }

      // 2. Name validation
      if (!row.name || row.name.trim().length === 0) {
        errors.push({ rowNumber: rowNum, field: 'Name', value: row.name, message: 'Location Name is required.' });
        hasRowError = true;
      }

      // 3. OrgNodeCode validation
      if (!row.orgNodeCode || !orgNodeMap.has(row.orgNodeCode.trim().toUpperCase())) {
        errors.push({
          rowNumber: rowNum,
          field: 'OrgNodeCode',
          value: row.orgNodeCode,
          message: `Department/Node Code '${row.orgNodeCode}' does not exist in your organization hierarchy.`,
        });
        hasRowError = true;
      }

      // 4. LocationType validation
      if (row.locationType && !allowedTypes.includes(row.locationType.trim().toUpperCase())) {
        errors.push({
          rowNumber: rowNum,
          field: 'LocationType',
          value: row.locationType,
          message: `Invalid type '${row.locationType}'. Allowed values: ${allowedTypes.join(', ')}.`,
        });
        hasRowError = true;
      }

      // 5. RiskLevel validation
      if (row.riskLevel && !allowedRisks.includes(row.riskLevel.trim().toUpperCase())) {
        errors.push({
          rowNumber: rowNum,
          field: 'RiskLevel',
          value: row.riskLevel,
          message: `Invalid risk level. Allowed values: ${allowedRisks.join(', ')}.`,
        });
        hasRowError = true;
      }

      // 6. AuditFrequency validation
      if (row.auditFrequency && !allowedFreqs.includes(row.auditFrequency.trim().toUpperCase())) {
        errors.push({
          rowNumber: rowNum,
          field: 'AuditFrequency',
          value: row.auditFrequency,
          message: `Invalid audit frequency. Allowed values: ${allowedFreqs.join(', ')}.`,
        });
        hasRowError = true;
      }

      if (!hasRowError) {
        validRows.push(row);
      }
    }

    return {
      totalRows: rows.length,
      validCount: validRows.length,
      errorCount: errors.length,
      errors,
      parsedData: rows,
    };
  }

  async commitLocationsBatch(tenantId: string, rows: LocationImportRow[], userId?: string) {
    const dryRun = await this.validateLocationsDryRun(tenantId, rows);
    if (dryRun.errorCount > 0) {
      throw new BadRequestException({
        message: 'Cannot commit batch import. Validation errors exist.',
        errors: dryRun.errors,
      });
    }

    const orgNodes = await this.prisma.orgNode.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    const orgNodeMap = new Map(orgNodes.map((n) => [n.code.toUpperCase(), n.id]));

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

    const createdLocations: any[] = [];

    // Atomic transaction
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const orgNodeId = orgNodeMap.get(row.orgNodeCode.trim().toUpperCase())!;
        const ownerId = row.ownerEmail ? userMap.get(row.ownerEmail.trim().toLowerCase()) : undefined;
        const qrCodeData = `5s://${tenantId}/locations/${row.areaCode.trim()}`;

        const loc = await tx.location.create({
          data: {
            tenantId,
            orgNodeId,
            areaCode: row.areaCode.trim(),
            name: row.name.trim(),
            locationType: (row.locationType || 'PRODUCTION_LINE').toUpperCase(),
            riskLevel: (row.riskLevel || 'LOW').toUpperCase(),
            auditFrequency: (row.auditFrequency || 'WEEKLY').toUpperCase(),
            building: row.building,
            floor: row.floor,
            description: row.description,
            ownerId,
            qrCodeData,
            status: 'ACTIVE',
          },
        });

        // Add default 5S milestones
        const now = new Date();
        const defaultMilestones = [
          { name: '1S - Sort & Red Tag Initial Sweep', days: 7 },
          { name: '2S - Set In Order & Visual Shadow Boards', days: 14 },
          { name: '3S - Shine & Cleaning Responsibilities', days: 21 },
          { name: '4S - Standardize & SOP Displays', days: 28 },
          { name: '5S - Sustain & Scheduled Audit Initiation', days: 35 },
        ];

        for (const m of defaultMilestones) {
          await tx.locationTimeline.create({
            data: {
              tenantId,
              locationId: loc.id,
              milestoneName: m.name,
              plannedStartDate: now,
              plannedEndDate: new Date(now.getTime() + m.days * 86400000),
              progressPercent: 0,
              status: 'NOT_STARTED',
              notes: 'Imported via Excel Batch Ingestion',
            },
          });
        }

        createdLocations.push(loc);
      }

      // Log import activity
      if (createdLocations.length > 0) {
        await tx.locationAuditLog.create({
          data: {
            tenantId,
            locationId: createdLocations[0].id,
            userId: userId || null,
            actionType: 'EXCEL_IMPORTED',
            details: JSON.stringify({
              action: `Bulk imported ${createdLocations.length} locations`,
              count: createdLocations.length,
            }),
          },
        });
      }
    });

    return {
      message: `Successfully imported ${createdLocations.length} locations.`,
      importedCount: createdLocations.length,
    };
  }
}
