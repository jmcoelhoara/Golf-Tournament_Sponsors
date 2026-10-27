export function validateTee(label:string,color:string) {
 label=label.trim();color=color.trim();if(!label || label.length>50)throw new Error('Tee label must be 1–50 characters.');
 if(color && !/^#[0-9a-f]{6}$/i.test(color))throw new Error('Use a six-digit hex color such as #ad6f32, or leave it empty.');
 return {label,color_hex:color||null};
}
export function validateYardage(hole:string,yards:string) {
 const hole_number=Number(hole),yardage=Number(yards);
 if(!Number.isInteger(hole_number) || hole_number<1 || hole_number>36 || !Number.isInteger(yardage) || yardage<1 || yardage>32767)throw new Error('Use an integer hole (1–36) and yardage (1–32767 yards).');
 return {hole_number,yardage};
}
