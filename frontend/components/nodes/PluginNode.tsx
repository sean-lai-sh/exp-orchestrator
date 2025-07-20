import BaseNode, { BaseNodeProps } from './BaseNode';
import { Handle, Position } from '@xyflow/react';
import { ChangeEvent } from 'react';

const PluginNode = (props: BaseNodeProps) => {
  const { id, data, setNodes, isConnectable } = props;

  const handleInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target;
    setNodes((nds: any) =>
      nds.map((node: any) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, [name]: value } };
        }
        return node;
      })
    );
  };

  return (
    <BaseNode {...props} color="bg-purple-100" shapeClass="rounded-lg">
      <div className="font-semibold text-purple-700 mb-2">Plugin Node</div>
      <input
        type="text"
        name="name"
        value={data.name}
        onChange={handleInputChange}
        className="p-1 border border-gray-300 rounded-md text-sm w-full mb-1"
        placeholder="Enter name"
      />
      <textarea
        name="description"
        value={data.description || ''}
        onChange={handleInputChange}
        className="p-1 border border-gray-300 rounded-md text-sm w-full h-12 resize-none mb-1"
        placeholder="Enter description"
      />
      <Handle type="target" position={Position.Left} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} isConnectable={isConnectable} />
    </BaseNode>
  );
};

export default PluginNode; 