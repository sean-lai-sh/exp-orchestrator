import {validate} from '@/lib/edgeEvals';
export default function Page(){
  // Example usage of the validate function
  const fromType = 'bytes';
  const toType = 'bytes';
  const compatibility = validate(fromType, toType);

  return (
    <div>
      {
        compatibility === 'ok' ? (
          <p>Types are compatible: {fromType} to {toType}</p>
        ) : (
          <p>Incompatible types: {fromType} to {toType} - {compatibility}</p>
        )
      }
    </div>
  )
}