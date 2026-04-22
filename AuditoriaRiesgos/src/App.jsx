import React, { useContext, useEffect, useRef, useState } from 'react';
import { Button, Form, Input, Popconfirm, Table, Modal, Layout, Typography, message } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import Login from './components/Login';
import { isAuthenticated, logout } from './services/LoginService';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;
const EditableContext = React.createContext(null);
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5500';

// Editable Row Component
const EditableRow = ({ index, ...props }) => {
  const [form] = Form.useForm();
  return (
    <Form form={form} component={false}>
      <EditableContext.Provider value={form}>
        <tr {...props} />
      </EditableContext.Provider>
    </Form>
  );
};

// Editable Cell Component
const EditableCell = ({
  title,
  editable,
  children,
  dataIndex,
  record,
  handleSave,
  ...restProps
}) => {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const form = useContext(EditableContext);
  
  useEffect(() => {
    if (editing) {
      inputRef.current.focus();
    }
  }, [editing]);

  const toggleEdit = () => {
    setEditing(!editing);
    form.setFieldsValue({
      [dataIndex]: record[dataIndex],
    });
  };

  const save = async () => {
    try {
      const values = await form.validateFields();
      toggleEdit();
      handleSave({
        ...record,
        ...values,
      });
    } catch (errInfo) {
      console.log('Save failed:', errInfo);
    }
  };

  let childNode = children;
  if (editable) {
    childNode = editing ? (
      <Form.Item
        style={{
          margin: 0,
        }}
        name={dataIndex}
        rules={[
          {
            required: true,
            message: `${title} is required.`,
          },
        ]}
      >
        <Input ref={inputRef} onPressEnter={save} onBlur={save} />
      </Form.Item>
    ) : (
      <div
        className="editable-cell-value-wrap"
        style={{
          paddingRight: 24,
        }}
        onClick={toggleEdit}
      >
        {children}
      </div>
    );
  }
  return <td {...restProps}>{childNode}</td>;
};

// Main App Component
const App = () => {
  // Authentication state
  const [authenticated, setAuthenticated] = useState(isAuthenticated());
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('user') || '');
  
  // Handle successful login
  const handleLoginSuccess = (response) => {
    setAuthenticated(true);
    setCurrentUser(response.user);
    message.success(`Bienvenido, ${response.user}!`);
  };
  
  // Handle logout
  const handleLogout = () => {
    logout();
    setAuthenticated(false);
    setCurrentUser('');
    message.info('Sesión cerrada correctamente');
  };
  
  // Application state
  const [isLoading, setIsLoading] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [suggestEnabled, setSuggestEnabled] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [dataSource, setDataSource] = useState([]);
  const [count, setCount] = useState(1);
  const [newData, setNewData] = useState({
    activo: '',
    riesgo: '',
    impacto: '',
    tratamiento: ''
  });

  const resetNewData = () => {
    setNewData({
      activo: '',
      riesgo: '',
      impacto: '',
      tratamiento: ''
    });
  };

  // Show modal for adding new asset
  const showModal = () => {
    setIsModalVisible(true);
  };

  // Hide modal
  const handleCancel = () => {
    setIsModalVisible(false);
    resetNewData();
  };
  
  // Handle deletion of a row
  const handleDelete = (key) => {
    const newData = dataSource.filter((item) => item.key !== key);
    setDataSource(newData);
    if (newData.length === 0) {
      setSuggestEnabled(false);
    }
  };

  const createRowsFromAnalysis = (activo, riesgos, impactos) => {
    const normalizedRisks = Array.isArray(riesgos) ? riesgos.filter(Boolean) : [];
    const normalizedImpacts = Array.isArray(impactos) ? impactos.filter(Boolean) : [];

    if (normalizedRisks.length === 0) {
      return [{
        activo,
        riesgo: `Pérdida de ${activo}`,
        impacto: `Pérdida de información valiosa relacionada con ${activo}`,
        tratamiento: '-'
      }];
    }

    return normalizedRisks.map((riesgo, index) => ({
      activo,
      riesgo,
      impacto: normalizedImpacts[index] || normalizedImpacts[0] || `Impacto asociado a ${riesgo.toLowerCase()}`,
      tratamiento: '-'
    }));
  };

  // Handle adding new asset using backend analysis
  const handleOk = async () => {
    const activo = newData.activo.trim();

    if (!activo) {
      message.error('Por favor ingresa un nombre de activo');
      return;
    }

    setIsLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/analizar-riesgos`, {
        activo,
      });

      const rows = createRowsFromAnalysis(activo, response.data?.riesgos, response.data?.impactos);
      addNewRows(rows);

      setIsModalVisible(false);
      resetNewData();
      setSuggestEnabled(true);
      message.success(`Activo "${activo}" agregado con éxito`);
    } catch (error) {
      const fallbackRows = createRowsFromAnalysis(activo);
      addNewRows(fallbackRows);
      setIsModalVisible(false);
      resetNewData();
      setSuggestEnabled(true);
      console.error('Error al analizar riesgos:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add one or more rows to the table
  const addNewRows = (rows) => {
    const startKey = count;
    const tableRows = rows.map((row, index) => ({
      key: `${startKey + index}`,
      ...row,
    }));

    setDataSource((currentData) => [...currentData, ...tableRows]);
    setCount((currentCount) => currentCount + tableRows.length);
  };

  // Handle recommendation of treatments using backend analysis
  const handleRecommendTreatment = async () => {
    if (dataSource.length === 0) {
      message.warning('No hay riesgos para recomendar tratamientos');
      return;
    }

    setIsRecommending(true);

    try {
      const updatedRows = await Promise.all(
        dataSource.map(async (item) => {
          const response = await axios.post(`${API_BASE_URL}/sugerir-tratamiento`, {
            activo: item.activo,
            riesgo: item.riesgo,
            impacto: item.impacto,
          });

          return {
            ...item,
            tratamiento: response.data?.tratamiento || item.tratamiento || '-',
          };
        })
      );

      setDataSource(updatedRows);
      message.success('Tratamientos recomendados con éxito');
    } catch (error) {
      const fallbackTreatments = [
        'Implementación de controles de acceso',
        'Copias de seguridad periódicas',
        'Cifrado de datos sensibles',
        'Capacitación de personal sobre seguridad',
        'Monitoreo continuo de accesos',
      ];

      const fallbackRows = dataSource.map((item, index) => ({
        ...item,
        tratamiento: fallbackTreatments[index % fallbackTreatments.length],
      }));

      setDataSource(fallbackRows);
      console.error('Error al sugerir tratamientos:', error);
    } finally {
      setIsRecommending(false);
    }
  };

  // Handle save after cell edit
  const handleSave = (row) => {
    const newData = [...dataSource];
    const index = newData.findIndex((item) => row.key === item.key);
    const item = newData[index];
    newData.splice(index, 1, {
      ...item,
      ...row,
    });
    setDataSource(newData);
  };

  // Define table columns
  const defaultColumns = [
    {
      title: 'Activo',
      dataIndex: 'activo',
      width: '15%',
      editable: true,
    },
    {
      title: 'Riesgo',
      dataIndex: 'riesgo',
      width: '20%',
      editable: true,
    },
    {
      title: 'Impacto',
      dataIndex: 'impacto',
      width: '30%',
      editable: true,
    },
    {
      title: 'Tratamiento',
      dataIndex: 'tratamiento',
      width: '30%',
      editable: true,
    },
    {
      title: 'Operación',
      dataIndex: 'operation',
      render: (_, record) => (
        dataSource.length >= 1 ? (
          <Popconfirm title="¿Seguro que quieres eliminar?" onConfirm={() => handleDelete(record.key)}>
            <a>Eliminar</a>
          </Popconfirm>
        ) : null
      ),
    },
  ];

  // Set up table components
  const components = {
    body: {
      row: EditableRow,
      cell: EditableCell,
    },
  };

  // Configure columns for editing
  const columns = defaultColumns.map((col) => {
    if (!col.editable) {
      return col;
    }
    return {
      ...col,
      onCell: (record) => ({
        record,
        editable: col.editable,
        dataIndex: col.dataIndex,
        title: col.title,
        handleSave,
      }),
    };
  });

  // If not authenticated, show the login page
  if (!authenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }
  
  // If authenticated, show the app with header and content
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Title level={4} style={{ color: 'white', margin: 0 }}>Sistema de Auditoría de Riesgos</Title>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Text style={{ color: 'white', marginRight: 16 }}>
            <UserOutlined /> {currentUser}
          </Text>
          <Button 
            type="link" 
            icon={<LogoutOutlined />} 
            onClick={handleLogout}
            style={{ color: 'white' }}
          >
            Cerrar Sesión
          </Button>
        </div>
      </Header>
      
      <Content style={{ padding: '24px', background: '#fff' }}>
        <div>
          <Button onClick={showModal} type="primary" style={{ marginBottom: 16 }}>
            + Agregar activo
          </Button>
          <Button 
            onClick={handleRecommendTreatment} 
            type="primary" 
            loading={isRecommending} 
            disabled={!suggestEnabled} 
            style={{ marginBottom: 16, marginLeft: 8 }}
          >
            Recomendar tratamientos
          </Button>
          
          <Modal
            title="Agregar nuevo activo"
            open={isModalVisible}
            onOk={handleOk}
            onCancel={handleCancel}
            okText="Agregar"
            cancelText="Cancelar"
            confirmLoading={isLoading}
          >
            <Form layout="vertical">
              <Form.Item 
                label="Activo" 
                rules={[{ required: true, message: 'Por favor ingresa un nombre de activo' }]}
              >
                <Input 
                  name="activo" 
                  value={newData.activo} 
                  onChange={(e) => setNewData({ ...newData, activo: e.target.value })}
                  placeholder="Ej: Base de datos de clientes" 
                />
              </Form.Item>
            </Form>
          </Modal>

          <Table
            components={components}
            rowClassName={() => 'editable-row'}
            bordered
            dataSource={dataSource}
            columns={columns}
          />
        </div>
      </Content>
      
      <Footer style={{ textAlign: 'center' }}>
        Sistema de Auditoría de Riesgos ©{new Date().getFullYear()}
      </Footer>
    </Layout>
  );
};

export default App;
