/**
 * Baidu AI Search Integration
 *
 * Uses Baidu Qianfan AI Search REST API via proxyFetch.
 * API endpoint: POST https://qianfan.baidubce.com/v2/ai_search/web_search
 * Auth: Bearer token via BAIDU_API_KEY
 */

import { proxyFetch } from '@/lib/server/proxy-fetch';
import type { WebSearchResult, WebSearchSource } from '@/lib/types/web-search';

const BAIDU_API_URL = 'https://qianfan.baidubce.com/v2/ai_search/web_search';

/**
 * Baidu AI Search API response types
 */
interface BaiduSearchReference {
  title?: string;
  url?: string;
  site_name?: string;
  content?: string;
  icon?: string;
  source?: string;
}

interface BaiduSearchResponse {
  code?: number;
  message?: string;
  references?: BaiduSearchReference[];
}

/**
 * Search the web using Baidu AI Search API and return structured results.
 */
export async function searchWithBaidu(params: {
  query: string;
  apiKey: string;
  maxResults?: number;
}): Promise<WebSearchResult> {
  const { query, apiKey, maxResults = 10 } = params;

  const requestBody = {
    messages: [
      {
        content: query,
        role: 'user',
      },
    ],
    search_source: 'baidu_search_v2',
    resource_type_filter: [{ type: 'web', top_k: maxResults }],
  };

  const startTime = Date.now();
  const res = await proxyFetch(BAIDU_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    throw new Error(`Baidu AI Search API error (${res.status}): ${errorText || res.statusText}`);
  }

  const data = (await res.json()) as BaiduSearchResponse;
  const responseTime = (Date.now() - startTime) / 1000;

  // Check for API-level error
  if (data.code) {
    throw new Error(`Baidu AI Search API error (${data.code}): ${data.message || 'Unknown error'}`);
  }

  const sources: WebSearchSource[] = (data.references || []).map((ref, index) => ({
    title: ref.title || ref.site_name || '',
    url: ref.url || '',
    content: ref.content || '',
    score: 1 - index * (0.5 / maxResults), // Position-based score
  }));

  return {
    answer: '', // Baidu search doesn't return a summary answer in this endpoint
    sources,
    query,
    responseTime,
  };
}
