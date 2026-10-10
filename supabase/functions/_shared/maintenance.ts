// No environment toggle or client hint can override the database gate. Missing
// installation/unavailable database fails closed before any external operation.
export type MaintenanceAdmin = {rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{data: unknown; error: unknown}>};
export class MaintenanceError extends Error {}
export function isMaintenanceError(error: unknown): boolean {
 return error instanceof MaintenanceError || (error as {code?:string})?.code === 'PT503';
}
export function maintenanceResponse(headers: Record<string,string> = {}): Response {
 return new Response(JSON.stringify({error:'AutoType maintenance: please retry later.'}),
  {status:503,headers:{...headers,'Content-Type':'application/json','Retry-After':'60','Cache-Control':'no-store'}});
}
export async function maintenanceClosed(admin: MaintenanceAdmin): Promise<boolean> {
 const {data,error}=await admin.rpc('autotype_maintenance_status');
 if(error || typeof data !== 'boolean')throw new MaintenanceError('Maintenance status unavailable');
 return data;
}
export async function beginOperation(admin: MaintenanceAdmin, kind: string): Promise<string> {
 const {data,error}=await admin.rpc('autotype_begin_operation',{p_kind:kind});
 if(error || typeof data !== 'string')throw new MaintenanceError('Maintenance operation unavailable');
 return data;
}
export async function endOperation(admin: MaintenanceAdmin, lease: string): Promise<void> {
 const {error}=await admin.rpc('autotype_end_operation',{p_id:lease});
 // A retained lease makes closing refuse until the operator investigates. Never
 // auto-expire a possibly completed checkout/refund or hide a release failure.
 if(error)console.error('Maintenance operation release failed; operator investigation required');
}
