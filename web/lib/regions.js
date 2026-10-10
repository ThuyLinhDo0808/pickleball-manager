// Where people live (sign-up "Khu vực"): Vietnam's 34 provinces and cities (from
// 1 July 2025), big cities first, then the rest A–Z; plus "abroad".
export const REGIONS = [
  'TP. Hồ Chí Minh',
  'Hà Nội',
  'Đà Nẵng',
  'Hải Phòng',
  'Cần Thơ',
  'Huế',
  'An Giang',
  'Bắc Ninh',
  'Cà Mau',
  'Cao Bằng',
  'Đắk Lắk',
  'Điện Biên',
  'Đồng Nai',
  'Đồng Tháp',
  'Gia Lai',
  'Hà Tĩnh',
  'Hưng Yên',
  'Khánh Hòa',
  'Lai Châu',
  'Lâm Đồng',
  'Lạng Sơn',
  'Lào Cai',
  'Nghệ An',
  'Ninh Bình',
  'Phú Thọ',
  'Quảng Ngãi',
  'Quảng Ninh',
  'Quảng Trị',
  'Sơn La',
  'Tây Ninh',
  'Thái Nguyên',
  'Thanh Hóa',
  'Tuyên Quang',
  'Vĩnh Long',
];
export const ABROAD = 'Nước ngoài';

// Countries for a club's profile and the club search (Vietnam first; free text for others).
export const VIETNAM = 'Việt Nam';
export const COUNTRIES = [VIETNAM, 'Singapore', 'Thái Lan', 'Malaysia', 'Campuchia', 'Lào', 'Indonesia', 'Philippines', 'Hàn Quốc', 'Nhật Bản', 'Đài Loan', 'Trung Quốc', 'Úc', 'Hoa Kỳ', 'Canada'];
export const PROVINCES = REGIONS.filter((r) => r !== ABROAD);
