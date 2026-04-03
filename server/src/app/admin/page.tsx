'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { supabase } from '../../utils/supabase';

// Simple admin page to manage translation cache
export default function AdminTranslationPage() {
    const [translations, setTranslations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchTranslations();
    }, []);

    const fetchTranslations = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('translation_cache')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching cache:', error);
        } else {
            setTranslations(data || []);
        }
        setLoading(false);
    };

    const handleSave = async (sourceText: string) => {
        if (!editValue.trim()) return;

        const { error } = await supabase
            .from('translation_cache')
            .update({ translated_text: editValue.trim() })
            .eq('source_text', sourceText);

        if (error) {
            alert('업데이트 실패: ' + error.message);
        } else {
            // Update local state to reflect change without refetching all
            setTranslations(prev => prev.map(t => 
                t.source_text === sourceText ? { ...t, translated_text: editValue.trim() } : t
            ));
            setEditingKey(null);
            
            // Note: This only updates the cache. To see it on the app immediately, 
            // the cron job must run, or we need to update the markets table as well.
        }
    };

    const handleDelete = async (sourceText: string) => {
        if (!confirm('이 번역 캐시를 삭제하시겠습니까? (다음 크론 작업 시 DeepL이 다시 번역합니다)')) return;

        const { error } = await supabase
            .from('translation_cache')
            .delete()
            .eq('source_text', sourceText);

        if (error) {
            alert('삭제 실패: ' + error.message);
        } else {
            setTranslations(prev => prev.filter(t => t.source_text !== sourceText));
        }
    };

    const filteredTranslations = translations.filter(t => 
        t.source_text.toLowerCase().includes(searchTerm.toLowerCase()) || 
        t.translated_text.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>번역 관리자 (Translation Cache)</h1>
                <button 
                    onClick={fetchTranslations}
                    style={{ padding: '8px 16px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                    새로고침
                </button>
            </div>

            <div style={{ marginBottom: '20px' }}>
                <input 
                    type="text" 
                    placeholder="영어 원문 또는 한글 번역 검색..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ width: '100%', padding: '12px', fontSize: '16px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
            </div>

            {loading ? (
                <p>데이터를 불러오는 중입니다...</p>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                                <th style={{ padding: '12px', width: '40%' }}>영어 원문 (Source)</th>
                                <th style={{ padding: '12px', width: '40%' }}>한글 번역 (Translated)</th>
                                <th style={{ padding: '12px', width: '20%' }}>관리</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTranslations.map((t) => (
                                <tr key={t.source_text} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '12px' }}>
                                        {t.source_text}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {editingKey === t.source_text ? (
                                            <textarea 
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                style={{ width: '100%', padding: '8px', minHeight: '60px', fontFamily: 'inherit' }}
                                                autoFocus
                                            />
                                        ) : (
                                            t.translated_text
                                        )}
                                    </td>
                                    <td style={{ padding: '12px' }}>
                                        {editingKey === t.source_text ? (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                    onClick={() => handleSave(t.source_text)}
                                                    style={{ padding: '6px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    저장
                                                </button>
                                                <button 
                                                    onClick={() => setEditingKey(null)}
                                                    style={{ padding: '6px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <button 
                                                    onClick={() => {
                                                        setEditingKey(t.source_text);
                                                        setEditValue(t.translated_text);
                                                    }}
                                                    style={{ padding: '6px 12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    수정
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(t.source_text)}
                                                    style={{ padding: '6px 12px', background: '#9e9e9e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    삭제
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {filteredTranslations.length === 0 && (
                                <tr>
                                    <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
                                        검색 결과가 없습니다.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
