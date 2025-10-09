import { HttpClient } from "./httpclient.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function loadApiKey(){
    const apiKey = process.env.GAODE_API_KEY;
    if (!apiKey) {
        throw new Error("GAODE_API_KEY is not set");
    }
    return apiKey;
} 

/**
 * 获取天气
 * @param city 城市名称
 * @returns 天气信息
 */
export async function getWeather(city: string) {
    const apiKey = loadApiKey();
    const response = await HttpClient.get(`https://restapi.amap.com/v3/weather/weatherInfo?city=${city}&key=${apiKey}`);
    return response.data;
}

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 城市信息接口定义
interface CityInfo {
    name: string;      // 中文名
    adcode: string;    // 行政区划代码
    citycode: string;  // 城市编码
}

/**
 * 读取并解析 CSV 文件
 * @returns 城市信息数组
 */
function loadCityData(): CityInfo[] {
    // 根据当前文件位置找到 src 目录下的 CSV 文件
    // 编译后的文件在 build 目录，源文件在 src 目录
    const csvPath = path.join(__dirname, "../src/adcode_citycode.csv");
    const content = fs.readFileSync(csvPath, "utf-8");
    const lines = content.split("\n");
    
    // 过滤掉第一行表头和空行
    const dataLines = lines.slice(1).filter(line => line.trim());
    
    return dataLines.map(line => {
        const [name, adcode, citycode] = line.split(",");
        return { name: name.trim(), adcode: adcode.trim(), citycode: citycode.trim() };
    });
}

/**
 * 判断行政区划级别
 * @param adcode 行政区划代码
 * @returns 级别类型：province(省), city(市), district(区)
 */
function getAdminLevel(adcode: string): "province" | "city" | "district" {
    if (adcode.endsWith("0000")) {
        return "province";
    } else if (adcode.endsWith("00")) {
        return "city";
    } else {
        return "district";
    }
}

/**
 * 根据 adcode 查找省信息
 * @param adcode 行政区划代码
 * @param allCities 所有城市信息
 * @returns 省信息
 */
function findProvince(adcode: string, allCities: CityInfo[]): CityInfo | undefined {
    const provinceCode = adcode.substring(0, 2) + "0000";
    return allCities.find(c => c.adcode === provinceCode);
}

/**
 * 根据 adcode 查找市信息
 * @param adcode 行政区划代码
 * @param allCities 所有城市信息
 * @returns 市信息
 */
function findCity(adcode: string, allCities: CityInfo[]): CityInfo | undefined {
    const cityCode = adcode.substring(0, 4) + "00";
    return allCities.find(c => c.adcode === cityCode);
}

/**
 * 检查是否为直辖市
 * @param cityInfo 城市信息
 * @returns 是否为直辖市
 */
function isMunicipality(cityInfo: CityInfo): boolean {
    // 直辖市：北京(110000)、天津(120000)、上海(310000)、重庆(500000)
    const municipalities = ["110000", "120000", "310000", "500000"];
    return municipalities.includes(cityInfo.adcode);
}

/**
 * 检查是否为县级市（名称以"市"结尾但 adcode 不以00结尾）
 * @param cityInfo 城市信息
 * @returns 是否为县级市
 */
function isCountyLevelCity(cityInfo: CityInfo): boolean {
    const level = getAdminLevel(cityInfo.adcode);
    // 区级单位但名称以"市"结尾，视为县级市
    return level === "district" && cityInfo.name.endsWith("市");
}

/**
 * 构建完整的行政区划名称
 * @param cityInfo 匹配的城市信息
 * @param allCities 所有城市信息
 * @returns 完整的行政区划名称
 */
function buildFullName(cityInfo: CityInfo, allCities: CityInfo[]): string {
    const level = getAdminLevel(cityInfo.adcode);
    
    if (level === "province") {
        // 省级直接返回省名
        return cityInfo.name;
    }
    
    const province = findProvince(cityInfo.adcode, allCities);
    
    if (level === "city") {
        // 市级返回：省+市
        if (province && !isMunicipality(province)) {
            return `${province.name}${cityInfo.name}`;
        }
        return cityInfo.name;
    }
    
    // 区级：需要区分县级市和普通区
    if (isCountyLevelCity(cityInfo)) {
        // 县级市：省+县级市（不显示地级市）
        if (province) {
            return `${province.name}${cityInfo.name}`;
        }
        return cityInfo.name;
    }
    
    // 普通区级返回：省+市+区 或 直辖市+区
    const city = findCity(cityInfo.adcode, allCities);
    
    if (province && isMunicipality(province)) {
        // 直辖市的区：直辖市名+区名（去掉中间的市）
        return `${province.name}${cityInfo.name}`;
    } else if (province && city) {
        // 普通省市的区：省名+市名+区名
        return `${province.name}${city.name}${cityInfo.name}`;
    } else if (province) {
        // 只有省信息
        return `${province.name}${cityInfo.name}`;
    }
    
    return cityInfo.name;
}

/**
 * 查找某个省下的所有区（包括市辖区和县级市）
 * @param provinceCode 省代码（前2位）
 * @param allCities 所有城市信息
 * @returns 该省下的所有区
 */
function findDistrictsInProvince(provinceCode: string, allCities: CityInfo[]): CityInfo[] {
    return allCities.filter(c => {
        const level = getAdminLevel(c.adcode);
        // 找出同省的所有区级单位
        return level === "district" && c.adcode.startsWith(provinceCode);
    });
}

/**
 * 查找某个市下的所有区
 * @param cityCode 市代码（前4位）
 * @param allCities 所有城市信息
 * @returns 该市下的所有区
 */
function findDistrictsInCity(cityCode: string, allCities: CityInfo[]): CityInfo[] {
    return allCities.filter(c => {
        const level = getAdminLevel(c.adcode);
        // 找出同市的所有区级单位
        return level === "district" && c.adcode.startsWith(cityCode);
    });
}

export function getCity(adcode: string): CityInfo | undefined {
    const allCities = loadCityData();
    return allCities.find(c => c.adcode === adcode);
}

/**
 * 获取城市编码
 * @param city 城市名称（支持模糊匹配，可为 null 或 undefined，返回全部）
 * @returns 城市信息数组（CityInfo对象数组，包含name、adcode、citycode），最多返回10条
 */
export function listCity(city?: string | null): CityInfo[] {
    const allCities = loadCityData();
    
    // 模糊匹配：第一列包含输入的关键词
    const matches = allCities.filter(c => c.name.includes(city || ""));
    
    // 展开搜索结果：如果匹配到省或市，返回其下属的区
    const expandedMatches: CityInfo[] = [];
    
    for (const match of matches) {
        const level = getAdminLevel(match.adcode);
        
        if (level === "province") {
            // 省级：返回该省下的所有区
            const districts = findDistrictsInProvince(match.adcode.substring(0, 2), allCities);
            expandedMatches.push(...districts);
        } else if (level === "city") {
            // 市级：返回该市下的所有区
            const districts = findDistrictsInCity(match.adcode.substring(0, 4), allCities);
            if (districts.length > 0) {
                // 如果有区，返回所有区
                expandedMatches.push(...districts);
            } else {
                // 如果没有区（可能是县级市或地级市没有区划），返回市本身
                expandedMatches.push(match);
            }
        } else {
            // 区级：直接返回
            expandedMatches.push(match);
        }
        
        // 如果已经超过10条，停止展开
        if (expandedMatches.length >= 10) {
            break;
        }
    }
    
    // 限制返回10条
    const limitedMatches = expandedMatches.slice(0, 100);
    
    // 为每个匹配项构建完整的行政区划名称，并返回 CityInfo 对象数组
    return limitedMatches.map(match => ({
        name: buildFullName(match, allCities),
        adcode: match.adcode,
        citycode: match.citycode
    }));
}


