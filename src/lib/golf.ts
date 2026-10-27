import type { Unit } from './format';
export type Yardage={hole_number:number;yardage:number};
export type Tee={id:string;label:string;color_hex:string|null;archived_at:string|null;course_hole_yardages:Yardage[]};
export type Course={id:string;organization_id:string;name:string;archived_at:string|null;course_tees:Tee[]};
export type Preset={key:string;name:string};
export type ContestRow={id:string;event_id:string;name:string;status:string;public_token:string;hole_number:number|null;tee_id:string|null;tees:string|null;hole_yardage:number|null;sponsor_banner_id:string|null;archived_at:string|null;unit:Unit;scoring_mode:string;contest_leaders:{leader_name:string|null;team_name:string|null;value:number|null;entry_count:number}|null};
