'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Pipette, Check } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  disabled?: boolean;
}

const PRESET_COLORS = [
  // Primary colors
  '#5843BE', '#6366F1', '#8B5CF6', '#A855F7',
  // Blues
  '#3B82F6', '#0EA5E9', '#06B6D4', '#14B8A6',
  // Greens
  '#10B981', '#22C55E', '#84CC16', '#EAB308',
  // Warm colors
  '#F59E0B', '#F97316', '#EF4444', '#EC4899',
  // Neutrals
  '#6B7280', '#374151', '#1F2937', '#111827',
];

export function ColorPicker({ value, onChange, label, disabled }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue);
    }
  };

  const handleColorSelect = (color: string) => {
    setInputValue(color);
    onChange(color);
  };

  const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    onChange(newValue);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
          {label}
        </label>
      )}
      
      <div className="flex items-center gap-3">
        {/* Color Preview Button */}
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className="relative w-12 h-12 rounded-xl border-2 border-[var(--border)] overflow-hidden shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
          style={{ backgroundColor: value }}
        >
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          {/* Checkerboard pattern for transparency indication */}
          <div 
            className="absolute inset-0 -z-10"
            style={{
              backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
              backgroundSize: '8px 8px',
              backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
            }}
          />
        </button>

        {/* Hex Input */}
        <div className="flex-1 relative">
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder="#000000"
            className="w-full px-4 py-3 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/20 focus:border-[var(--primary)] transition-all text-[var(--text-primary)] font-mono text-sm uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>

        {/* Native Color Picker */}
        <label className="relative cursor-pointer">
          <input
            type="color"
            value={value}
            onChange={handleNativeColorChange}
            disabled={disabled}
            className="sr-only"
          />
          <div className="w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-center hover:bg-[var(--surface-hover)] transition-colors">
            <Pipette className="w-5 h-5 text-[var(--text-secondary)]" />
          </div>
        </label>
      </div>

      {/* Dropdown Color Palette */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 p-4 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50 min-w-[280px] animate-fade-in">
          <p className="text-xs font-medium text-[var(--text-tertiary)] mb-3 uppercase tracking-wider">
            Preset Colors
          </p>
          <div className="grid grid-cols-8 gap-2">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => handleColorSelect(color)}
                className="w-7 h-7 rounded-lg border border-[var(--border)] hover:scale-110 transition-transform relative group"
                style={{ backgroundColor: color }}
                title={color}
              >
                {value.toLowerCase() === color.toLowerCase() && (
                  <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow-md" />
                )}
              </button>
            ))}
          </div>
          
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-xs font-medium text-[var(--text-tertiary)] mb-2 uppercase tracking-wider">
              Current Color
            </p>
            <div className="flex items-center gap-3">
              <div 
                className="w-10 h-10 rounded-lg border border-[var(--border)]"
                style={{ backgroundColor: value }}
              />
              <span className="font-mono text-sm text-[var(--text-primary)]">{value}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
