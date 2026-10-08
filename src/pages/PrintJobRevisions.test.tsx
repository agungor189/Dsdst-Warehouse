import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
const api = vi.hoisted(() => ({ listPrintJobs: vi.fn(), acknowledgeReplacement: vi.fn(), reprint: vi.fn() }));
vi.mock('../features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'operator', role: 'admin', permissions: {} } }), hasWarehousePermission: () => true }));
vi.mock('../lib/api', () => ({ warehouseAdminApi: api, warehouseExecutionApi: {}, getErrorMessage: (e: Error) => e.message }));
import { PrintJobsPage } from './WarehouseAdminPages';

it('superseded reprint is disabled and new physical submission needs explicit old-label confirmation', async () => {
  const base = { subject_code: 'PKG-1', purpose: 'GOODS_RECEIPT_PACKAGE', attempts: [], history: [] };
  const old = { ...base, id: 'old', status: 'DELIVERY_UNKNOWN', superseded_by_job_id: 'new', current_job_id: 'new' };
  const next = { ...base, id: 'new', status: 'QUEUED', current_job_id: 'new', replacement_blocked: true, replacement_warning: 'Eski etiketi çıkar/değiştir' };
  api.listPrintJobs.mockResolvedValue([old,next]); api.acknowledgeReplacement.mockResolvedValue({ ...next, replacement_blocked: false });
  const confirmation = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  const user = userEvent.setup(); const { container } = render(<PrintJobsPage/>);
  await screen.findByText('Geçersiz etiket sürümü.');
  expect(within(container.querySelector('#print-job-old') as HTMLElement).getByRole('button', { name: /Yeniden yazdır/ })).toBeDisabled();
  expect(within(container.querySelector('#print-job-new') as HTMLElement).getByRole('button', { name: /Yeniden yazdır/ })).toBeDisabled();
  const acknowledge = screen.getByRole('button', { name: /Eski etiketi çıkardım/ });
  await user.click(acknowledge); expect(api.acknowledgeReplacement).not.toHaveBeenCalled();
  await user.click(acknowledge); expect(api.acknowledgeReplacement).toHaveBeenCalledWith('new');
  expect(confirmation).toHaveBeenCalledWith(expect.stringContaining('yazıcıya gönderilmesine izin verir'));
  expect(api.reprint).not.toHaveBeenCalled();
});
