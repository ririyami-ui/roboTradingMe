import React from 'react';

export const ControlSkeleton: React.FC = () => (
  <div className="bg-gray-800 rounded-xl shadow-md p-5 animate-pulse">
    <div className="h-6 bg-gray-700 rounded w-1/3 mb-4"></div>
    <div className="space-y-4">
      <div className="h-10 bg-gray-700 rounded w-full"></div>
      <div className="h-10 bg-gray-700 rounded w-full"></div>
    </div>
  </div>
);

export const AnalysisSkeleton: React.FC = () => (
  <div className="bg-gray-800 rounded-xl shadow-md p-5 animate-pulse">
    <div className="h-6 bg-gray-700 rounded w-1/2 mb-4 mx-auto"></div>
    <div className="h-8 bg-gray-700 rounded w-3/4 mx-auto"></div>
  </div>
);
