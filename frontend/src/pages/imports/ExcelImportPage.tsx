import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { api } from '../../services/api';
import { DryRunResult } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  FileCheck,
  RefreshCw,
} from 'lucide-react';

export const ExcelImportPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentTenant, addToast } = useApp();

  const [file, setFile] = useState<File | null>(null);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);

  const handleDownloadTemplate = () => {
    window.location.href = api.downloadLocationTemplateUrl();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      handleValidate(selectedFile);
    }
  };

  const handleValidate = async (targetFile: File) => {
    setValidating(true);
    setDryRunResult(null);
    try {
      const result = await api.validateDryRunFile(targetFile);
      setDryRunResult(result);
      if (result.errorCount === 0) {
        addToast({
          type: 'success',
          title: 'Dry-Run Succeeded',
          message: `All ${result.validCount} rows passed schema & hierarchy parent validations. Ready to commit.`,
        });
      } else {
        addToast({
          type: 'warning',
          title: 'Validation Errors Detected',
          message: `Found ${result.errorCount} validation errors across spreadsheet rows.`,
        });
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Validation Failed',
        message: err?.response?.data?.message || 'Could not parse spreadsheet file.',
      });
    } finally {
      setValidating(false);
    }
  };

  const handleCommitBatch = async () => {
    if (!dryRunResult || dryRunResult.errorCount > 0) return;
    setCommitting(true);
    try {
      const res = await api.commitBatchLocations(dryRunResult.parsedData);
      addToast({
        type: 'success',
        title: 'Batch Committed',
        message: `Successfully created ${res.importedCount} locations with automated QR codes and 5S timelines.`,
      });
      navigate('/locations');
    } catch (err: any) {
      addToast({
        type: 'error',
        title: 'Batch Commit Failed',
        message: err?.response?.data?.message || 'Could not commit locations batch.',
      });
    } finally {
      setCommitting(false);
    }
  };

  // Sample data loader for quick demo
  const handleLoadSampleBatch = () => {
    const sampleRows = [
      {
        areaCode: 'LOC-BLR-MACH-CNC05',
        name: 'Horizontal Boring Machine HBM-01',
        locationType: 'PRODUCTION_LINE',
        orgNodeCode: 'BLR-DEPT-MACH',
        riskLevel: 'HIGH',
        auditFrequency: 'WEEKLY',
        building: 'Building A',
        floor: 'Ground Floor, Bay 4',
        description: 'Large-envelope boring station with dedicated chip extraction and shadow tool cabinet.',
        ownerEmail: 'owner.cnc01@skilglobal.com',
      },
      {
        areaCode: 'LOC-BLR-ASM-SUB03',
        name: 'Sub-Assembly Feeder Station 03',
        locationType: 'PRODUCTION_LINE',
        orgNodeCode: 'BLR-DEPT-ASM',
        riskLevel: 'LOW',
        auditFrequency: 'FORTNIGHTLY',
        building: 'Building B',
        floor: '2nd Floor',
        description: 'Manual torque fastener tightening station with illuminated visual bins.',
        ownerEmail: 'owner.asm01@skilglobal.com',
      },
      {
        areaCode: 'LOC-BLR-WH-STAGING02',
        name: 'Inbound Pallet Inspection Staging',
        locationType: 'WAREHOUSE_BAY',
        orgNodeCode: 'BLR-DEPT-WH',
        riskLevel: 'MEDIUM',
        auditFrequency: 'WEEKLY',
        building: 'Logistics Annex',
        floor: 'Dock 2',
        description: 'Floor-taped receiving inspection area with barcoding station.',
        ownerEmail: 'depthead.machining@skilglobal.com',
      },
    ];

    setDryRunResult({
      totalRows: sampleRows.length,
      validCount: sampleRows.length,
      errorCount: 0,
      errors: [],
      parsedData: sampleRows,
    });

    addToast({
      type: 'info',
      title: 'Sample Batch Loaded',
      message: 'Simulated 3 valid location records. Ready for dry-run verification & commit.',
    });
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="page-title">Excel & CSV Bulk Ingestion Hub</h1>
            <Badge variant="info" icon={<FileSpreadsheet size={12} />}>Two-Pass Validator</Badge>
          </div>
          <p className="page-subtitle">
            Ingest hundreds of physical workstations at once with dry-run error checking and atomic transaction safety.
          </p>
        </div>

        <div className="page-header-actions">
          <Button
            variant="secondary"
            icon={<Download size={16} />}
            onClick={handleDownloadTemplate}
          >
            Download Excel Template
          </Button>

          <Button
            variant="ghost"
            onClick={handleLoadSampleBatch}
          >
            Load Sample 3-Row Ingestion
          </Button>
        </div>
      </div>

      {/* Upload Drop Zone Card */}
      <Card noPadding>
        <div
          style={{
            padding: '40px 24px',
            textAlign: 'center',
            border: '2px dashed var(--border-strong)',
            borderRadius: 'var(--radius-lg)',
            margin: '20px',
            background: 'var(--bg-surface-subtle)',
            cursor: 'pointer',
          }}
          onClick={() => document.getElementById('excel-file-input')?.click()}
        >
          <input
            id="excel-file-input"
            type="file"
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-primary-light)',
              color: 'var(--color-primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
            }}
          >
            <Upload size={24} />
          </div>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {file ? file.name : 'Click to Upload or Drag & Drop Excel Spreadsheet'}
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Supports standard .xlsx and .csv files formatted per the 5S Master schema
          </p>
        </div>
      </Card>

      {/* Dry Run Results Card */}
      {dryRunResult && (
        <Card
          title="Two-Pass Dry-Run Validation Report"
          subtitle="Pre-commit integrity verification against current organization hierarchy and duplicate codes"
          actions={
            dryRunResult.errorCount === 0 && (
              <Button
                variant="primary"
                icon={<CheckCircle2 size={16} />}
                loading={committing}
                onClick={handleCommitBatch}
              >
                Commit {dryRunResult.validCount} Locations to Database
              </Button>
            )
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Summary Stat Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                background: 'var(--bg-surface-subtle)',
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total Processed</div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 700 }}>{dryRunResult.totalRows} Rows</div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: 'var(--color-success)', textTransform: 'uppercase' }}>Passed Validation</div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--color-success)' }}>
                  {dryRunResult.validCount} Rows
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: dryRunResult.errorCount > 0 ? 'var(--color-danger)' : 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Validation Errors
                </div>
                <div className="tabular-nums" style={{ fontSize: '18px', fontWeight: 700, color: dryRunResult.errorCount > 0 ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
                  {dryRunResult.errorCount} Errors
                </div>
              </div>
            </div>

            {/* Error Table if errors exist */}
            {dryRunResult.errorCount > 0 && (
              <div style={{ border: '1px solid var(--color-danger-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div style={{ padding: '10px 16px', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', fontWeight: 600, fontSize: '13px' }}>
                  Errors found in spreadsheet. Fix errors before committing:
                </div>
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Row #</th>
                      <th>Column Field</th>
                      <th>Provided Value</th>
                      <th>Validation Failure Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dryRunResult.errors.map((err, idx) => (
                      <tr key={idx}>
                        <td className="tabular-nums"><strong>Row {err.rowNumber}</strong></td>
                        <td><span className="code-tag">{err.field}</span></td>
                        <td><code>{String(err.value || '(empty)')}</code></td>
                        <td style={{ color: 'var(--color-danger)', fontWeight: 500 }}>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Parsed Rows Preview */}
            {dryRunResult.validCount > 0 && (
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  Validated Rows Preview ({dryRunResult.validCount} Areas):
                </div>
                <div className="enterprise-table-container">
                  <table className="enterprise-table">
                    <thead>
                      <tr>
                        <th>Area Code</th>
                        <th>Workstation Name</th>
                        <th>Org Node Code</th>
                        <th>Type</th>
                        <th>Risk Level</th>
                        <th>Audit Cadence</th>
                        <th>Building / Floor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dryRunResult.parsedData.map((row, idx) => (
                        <tr key={idx}>
                          <td><span className="code-tag">{row.areaCode}</span></td>
                          <td style={{ fontWeight: 600 }}>{row.name}</td>
                          <td><span className="code-tag" style={{ background: 'var(--color-purple-bg)', color: 'var(--color-purple)' }}>{row.orgNodeCode}</span></td>
                          <td><Badge variant="neutral">{row.locationType}</Badge></td>
                          <td><Badge variant={row.riskLevel === 'HIGH' ? 'warning' : 'success'}>{row.riskLevel}</Badge></td>
                          <td>{row.auditFrequency}</td>
                          <td style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.building} • {row.floor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
