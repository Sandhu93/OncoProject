import { type NextRequest, NextResponse } from 'next/server';

import { ApiError } from '@/services/api/api-errors';
import ReportsService, { type ReportFile } from '@/services/api/reports.service';

const FILES: Record<ReportFile, { type: string; extension: string }> = {
  xlsx: {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  waiting: { type: 'text/csv; charset=utf-8', extension: 'csv' },
  stalled: { type: 'text/csv; charset=utf-8', extension: 'csv' },
  treatment: { type: 'text/csv; charset=utf-8', extension: 'csv' },
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Downloads a report with the signed-in person's access. The API decides who may, and refuses anyone else. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const file = params.get('file') ?? '';

  if (!Object.hasOwn(FILES, file)) {
    return NextResponse.json({ message: 'Choose xlsx, waiting, stalled or treatment.' }, { status: 400 });
  }

  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';

  if ((from && !DAY.test(from)) || (to && !DAY.test(to))) {
    return NextResponse.json({ message: 'Use dates like 2026-12-01.' }, { status: 400 });
  }

  const { type, extension } = FILES[file as ReportFile];

  try {
    const body = await ReportsService.file(file as ReportFile, { from: from || undefined, to: to || undefined });
    const name = file === 'xlsx' ? 'reports' : file;

    return new NextResponse(body, {
      headers: {
        'Content-Type': type,
        'Content-Disposition': `attachment; filename="oncotrack-${name}-${from || 'start'}-to-${to || 'today'}.${extension}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status < 500 ? error.status : 502 });
    }

    throw error;
  }
}
