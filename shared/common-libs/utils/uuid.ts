import crypto from 'crypto';

/**
 * UUID v7 생성 유틸리티
 * 시간 순서가 보장되는 UUID v7 구현
 */
export class UUIDv7Generator {
  private static readonly EPOCH = Date.UTC(1582, 9, 15); // UUID epoch
  
  /**
   * UUID v7 생성
   * @returns 시간 순서가 보장되는 UUID v7 문자열
   */
  static generate(): string {
    // 현재 시간 (milliseconds since Unix epoch)
    const timestamp = Date.now();
    
    // 48-bit timestamp (milliseconds)
    const timestampHex = timestamp.toString(16).padStart(12, '0');
    
    // 12-bit version + random bits
    const version = 7; // UUID v7
    const versionHex = version.toString(16);
    
    // Random bytes for the rest
    const randomBytes = crypto.randomBytes(10);
    
    // Construct UUID v7
    const uuid = [
      timestampHex.substring(0, 8), // time-high
      timestampHex.substring(8, 12), // time-mid
      versionHex + timestampHex.substring(12, 15), // version + time-low
      (randomBytes[0] & 0x3f | 0x80).toString(16).padStart(2, '0') + randomBytes[1].toString(16).padStart(2, '0'), // variant + random
      randomBytes.subarray(2, 8).toString('hex') // random
    ].join('-');
    
    return uuid;
  }
  
  /**
   * UUID에서 타임스탬프 추출
   * @param uuid UUID v7 문자열
   * @returns 타임스탬프 (Date 객체)
   */
  static extractTimestamp(uuid: string): Date {
    const hex = uuid.replace(/-/g, '');
    const timestampHex = hex.substring(0, 12);
    const timestamp = parseInt(timestampHex, 16);
    return new Date(timestamp);
  }
  
  /**
   * UUID 유효성 검증
   * @param uuid 검증할 UUID 문자열
   * @returns 유효한 UUID v7인지 여부
   */
  static isValid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
  
  /**
   * 정렬 가능한 UUID v7 생성 (시간 순서 보장)
   * @returns 정렬 가능한 UUID v7
   */
  static generateSortable(): string {
    // 나노초 정밀도를 위한 추가 카운터
    const timestamp = Date.now();
    const nanoIncrement = process.hrtime.bigint() % 1000000n;
    
    const timestampHex = timestamp.toString(16).padStart(12, '0');
    const nanoHex = nanoIncrement.toString(16).padStart(6, '0');
    
    const version = 7;
    const versionHex = version.toString(16);
    
    const randomBytes = crypto.randomBytes(6);
    
    const uuid = [
      timestampHex.substring(0, 8),
      timestampHex.substring(8, 12),
      versionHex + nanoHex.substring(0, 3),
      (randomBytes[0] & 0x3f | 0x80).toString(16).padStart(2, '0') + randomBytes[1].toString(16).padStart(2, '0'),
      randomBytes.subarray(2, 6).toString('hex') + nanoHex.substring(3, 6)
    ].join('-');
    
    return uuid;
  }
}

/**
 * 단순한 UUID v7 생성 함수
 */
export const generateUUIDv7 = (): string => UUIDv7Generator.generate();

/**
 * 정렬 가능한 UUID v7 생성 함수
 */
export const generateSortableUUIDv7 = (): string => UUIDv7Generator.generateSortable();

/**
 * UUID 유효성 검증 함수
 */
export const isValidUUIDv7 = (uuid: string): boolean => UUIDv7Generator.isValid(uuid);

/**
 * UUID에서 타임스탬프 추출 함수
 */
export const extractUUIDTimestamp = (uuid: string): Date => UUIDv7Generator.extractTimestamp(uuid);

export default UUIDv7Generator;