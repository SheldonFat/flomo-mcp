/**
 * HTTP 请求工具类
 * 基于 Node.js 原生 fetch API 实现
 */

/**
 * HTTP 请求方法枚举
 */
export enum HttpMethod {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  DELETE = "DELETE",
}

/**
 * 请求配置接口
 */
interface RequestConfig {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: Record<string, any>;
  timeout?: number;
}

/**
 * 请求响应接口
 */
export interface HttpResponse<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

/**
 * HTTP 客户端工具类
 */
export class HttpClient {
  /**
   * 底层请求方法，所有 HTTP 请求都通过此方法实现
   * @param config 请求配置
   * @returns 返回 Promise<HttpResponse>
   */
  private static async request<T = any>(config: RequestConfig): Promise<HttpResponse<T>> {
    const { url, method, headers = {}, body, timeout = 30000 } = config;

    // 记录请求开始时间
    const startTime = Date.now();
    
    // 日志变量
    let status = 0;
    let statusText = "";
    let responseData: any = null;
    let errorType = "";
    let errorMessage = "";
    let success = false;

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      // 设置默认请求头
      const defaultHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Node.js HTTP Client",
        ...headers,
      };

      // 构建 fetch 请求选项
      const fetchOptions: RequestInit = {
        method,
        headers: defaultHeaders,
        signal: controller.signal,
      };

      // 如果是 POST 请求且有 body，则添加请求体
      if (method === HttpMethod.POST && body) {
        fetchOptions.body = JSON.stringify(body);
      }

      // 发起请求
      const response = await fetch(url, fetchOptions);

      // 解析响应头
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      // 解析响应体
      let data: T;
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await response.json();
      } else {
        data = (await response.text()) as T;
      }

      // 记录响应信息到日志变量
      status = response.status;
      statusText = response.statusText;
      responseData = data;
      success = response.ok;

      // 构建响应对象
      const httpResponse: HttpResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };

      // 如果响应状态码不是 2xx，抛出错误
      if (!response.ok) {
        throw new Error(
          `HTTP request failed status ${response.status} statusText ${response.statusText}`
        );
      }

      return httpResponse;
    } catch (error: any) {
      // 记录错误信息到日志变量
      errorType = error.name;
      errorMessage = error.message;
      
      // 处理超时错误
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      // 清除超时定时器
      clearTimeout(timeoutId);
      
      // 计算请求耗时
      const duration = Date.now() - startTime;
      
      // 一行日志记录所有信息
      if (success) {
        console.log(`HTTP Request: method ${method} url ${url} headers ${JSON.stringify(headers)} body ${JSON.stringify(body || {})} status ${status} statusText ${statusText} responseData ${JSON.stringify(responseData)} duration ${duration}ms`);
      } else {
        console.error(`HTTP Request: method ${method} url ${url} headers ${JSON.stringify(headers)} body ${JSON.stringify(body || {})} errorType ${errorType} errorMessage ${errorMessage} duration ${duration}ms`);
      }
    }
  }

  /**
   * GET 请求方法
   * @param url 请求 URL
   * @param headers 请求头，可选
   * @param timeout 超时时间（毫秒），默认 30000ms
   * @returns 返回 Promise<HttpResponse>
   */
  public static async get<T = any>(
    url: string,
    headers?: Record<string, string>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    timeout = timeout || 30000;
    return this.request<T>({
      url,
      method: HttpMethod.GET,
      headers,
      timeout,
    });
  }
  
  /**
   * POST 请求方法
   * @param url 请求 URL
   * @param body 请求体数据
   * @param headers 请求头，可选
   * @param timeout 超时时间（毫秒），默认 30000ms
   * @returns 返回 Promise<HttpResponse>
   */
  public static async post<T = any>(
    url: string,
    body: Record<string, any>,
    headers?: Record<string, string>,
    timeout?: number
  ): Promise<HttpResponse<T>> {
    return this.request<T>({
      url,
      method: HttpMethod.POST,
      headers,
      body,
      timeout,
    });
  }
}

// 导出便捷方法
export const get = HttpClient.get.bind(HttpClient);
export const post = HttpClient.post.bind(HttpClient);

