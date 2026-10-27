import type { SupabaseClient } from '@supabase/supabase-js';
export function validateRaster(file: {type: string; size: number}): string {
 const extension = ({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[file.type];
 if (!extension) throw new Error('Choose a PNG, JPEG or WebP raster image.');
 if (file.size <= 0) throw new Error('The image is empty.');
 if (file.size > 10485760) throw new Error('Images must be 10 MiB or smaller.');
 return extension;
}
export function checkedMutation<T>(result: {data: T; error: {message: string} | null}, rows = false): NonNullable<T> {
 if(result.error) throw new Error(result.error.message);
 const data = result.data;
 if(data && typeof data==='object' && 'ok' in data && data.ok === false) throw new Error(String('error' in data ? data.error : 'Mutation failed'));
 if(!data || (rows && (!Array.isArray(data) || data.length===0)) || (!rows && (!(typeof data==='object') || !('ok' in data) || data.ok !== true))) throw new Error('No change was made. Access may have been revoked; reload and try again.');
 return data as NonNullable<T>;
}
export async function uploadEventImage(client: SupabaseClient, input: {organizationId: string;eventId:string;kind:'event_logo'|'sponsor_banner';label:string;file:File;contestId?:string}) {
 const extension = validateRaster(input.file);
 const label=input.label.trim(); if(!label || label.length>200) throw new Error('Provide an image label (1–200 characters).');
 const path=`${input.organizationId}/${input.eventId}/${crypto.randomUUID()}.${extension}`;
 const {error} = await client.storage.from('event-media').upload(path,input.file,{upsert:false,contentType:input.file.type});
 if(error) throw new Error(error.message);
 const registration=checkedMutation(await client.rpc('register_event_image',{p_event_id:input.eventId,p_kind:input.kind,p_object_path:path,p_label:label})) as {image_id?:string};
 if(!registration.image_id) throw new Error('Image registration returned no ID. The upload was retained for administrator review.');
 checkedMutation(await client.rpc(input.kind==='event_logo'?'set_event_logo':'set_contest_banner',input.kind==='event_logo'?{p_event_id:input.eventId,p_image_id:registration.image_id}:{p_contest_id:input.contestId,p_image_id:registration.image_id}));
 return registration.image_id;
}
export type PublicImage = {bucket: string; path: string; alt_text: string};
export function eventImageUrl(image: PublicImage | null | undefined) {
  if (!image || image.bucket !== 'event-media') return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/${image.path.split('/').map(encodeURIComponent).join('/')}`;
}
